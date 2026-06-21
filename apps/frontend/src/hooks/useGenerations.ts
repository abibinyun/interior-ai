import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/error';
import { getLastRateLimit } from '../api/client';
import {
  approve,
  createBatch,
  getBatch,
  listGenerationsByRoom,
  reopen,
  type BatchResponse,
  type CreateBatchInput,
  type Generation,
} from '../api/generations';
import { roomQueryKey } from './useRoomBrief';

export const generationsByRoomQueryKey = (roomId: string) =>
  ['rooms', roomId, 'generations'] as const;
export const batchQueryKey = (roomId: string, batchId: string) =>
  ['rooms', roomId, 'generations', 'batches', batchId] as const;

/**
 * Query wrapper around `GET /api/rooms/:id/generations`. Returns the
 * last ~50 generations for the room (the backend caps the list).
 */
export function useGenerationsByRoom(roomId: string | undefined) {
  return useQuery<{ items: Generation[] }>({
    queryKey: roomId ? generationsByRoomQueryKey(roomId) : ['rooms', 'no-id', 'generations'],
    queryFn: () => listGenerationsByRoom(roomId!),
    enabled: Boolean(roomId),
  });
}

/**
 * Steady-state polling interval when any row is still processing.
 * 2 s gives a responsive "the card just flipped" feel without
 * flooding the bucket. The self-pacing layer below will lengthen
 * this when the bucket is hot.
 */
const STEADY_INTERVAL_MS = 2_000;

/**
 * Conservative interval when the bucket is low but not empty. We
 * use this for `remaining === 1` so we still see completions but
 * don't immediately burn the last token.
 */
const LOW_BUCKET_INTERVAL_MS = 8_000;

/**
 * Floor under the server's `Retry-After` value. If the server says
 * "wait 2 s" we still wait at least 5 s so the bucket has time to
 * actually reset (the header is a floor, not a precise deadline).
 */
const RETRY_AFTER_FLOOR_MS = 5_000;

/**
 * Query wrapper around `GET /api/rooms/:id/generations/batches/:batchId`.
 * When `pollWhile` is true, the query auto-refreshes until the batch
 * has at least one PENDING or PROCESSING row. This is the "watch
 * the generations finish" polling the UI needs.
 *
 * ## Polling interval adaptation
 *
 * The default backend bucket is 5 requests / 60 s (M17). The batch
 * lifecycle is roughly:
 *
 * ```
 *   POST /generations           ← consumes 1
 *   GET  /generations (refetch) ← consumes 1
 *   GET  /batches/:id  poll 1   ← consumes 1
 *   GET  /batches/:id  poll 2   ← consumes 1
 *   GET  /batches/:id  poll 3   ← consumes 1  → bucket empty
 *   GET  /batches/:id  poll 4   ← 429
 * ```
 *
 * With a 2 s steady interval, the bucket empties in ~6 s and the
 * next poll triggers a 429. The previous "max(Retry-After, 30 s)"
 * backoff only kicked in AFTER the first 429, so the user saw
 * "200, 200, 200, 200, 200, 429, 30 s, 200, 200, 200, 200, 200,
 * 429, 30 s, …" — visible as a perpetual 429 cycle in DevTools.
 *
 * The fix has two layers:
 *
 * 1. **Proactive self-pacing** (preferred): on every successful
 *    poll, `apiFetch` updates a module-level cache with the latest
 *    `RateLimit-Remaining` value. When `remaining <= 1`, the
 *    polling interval jumps to `LOW_BUCKET_INTERVAL_MS` (8 s)
 *    BEFORE the next request would 429. This avoids the
 *    429 → backoff cycle entirely for most batches.
 *
 * 2. **Reactive backoff** (safety net): if a 429 slips through
 *    (e.g., the very first poll when the cache is still cold),
 *    honor the server's `Retry-After` header — but never less than
 *    `RETRY_AFTER_FLOOR_MS`. The server's value is "seconds until
 *    the bucket resets" and is computed from the actual bucket
 *    state, so it's more accurate than a magic 30 s.
 *
 * ## Stop conditions
 *
 * - All rows are `COMPLETED` or `FAILED` → stop.
 * - Query errored on anything other than 429 → stop (the user
 *   must re-trigger generation; polling a broken batch is
 *   pointless and was the source of the original "phantom poll"
 *   problem that burned the bucket before generation even
 *   started).
 * - `pollWhile` is false → stop.
 *
 * If the user navigates away, `refetchIntervalInBackground: false`
 * keeps the browser tab from spinning polls in the background.
 */
export function useBatchStatus(
  roomId: string | undefined,
  batchId: string | undefined,
  options?: { pollWhile?: boolean },
) {
  const pollWhile = options?.pollWhile ?? true;
  return useQuery<BatchResponse>({
    queryKey:
      roomId && batchId ? batchQueryKey(roomId, batchId) : ['rooms', 'no-id', 'batches', 'no-id'],
    queryFn: () => getBatch(roomId!, batchId!),
    enabled: Boolean(roomId && batchId),
    refetchInterval: (query) => {
      if (!pollWhile) return false;
      const data = query.state.data;
      const error = query.state.error;

      // Any non-429 error is a stop condition. Re-polling won't
      // fix a 400/404/500; the user has to re-trigger generation.
      if (error) {
        if (error instanceof ApiError && error.isRateLimited()) {
          // Reactive backoff — server told us when the bucket
          // resets. Floor it so a tiny "Retry-After: 1" doesn't
          // re-burn the bucket immediately.
          const serverBackoff = (error.retryAfter ?? 0) * 1000;
          return Math.max(serverBackoff, RETRY_AFTER_FLOOR_MS);
        }
        return false;
      }

      if (!data) return STEADY_INTERVAL_MS;
      const allDone = data.items.every((g) => g.status === 'COMPLETED' || g.status === 'FAILED');
      if (allDone) return false;

      // Proactive self-pacing: if our last observation of the
      // bucket says it's almost empty, slow down BEFORE we get a
      // 429. This is the main fix — it prevents the 429/200/429
      // ping-pong the user reported in the F12 review session.
      const rl = getLastRateLimit();
      if (rl && rl.remaining <= 1) {
        return LOW_BUCKET_INTERVAL_MS;
      }

      return STEADY_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
  });
}

/**
 * Mutation hook for `POST /api/rooms/:id/generations`. On success,
 * invalidates the room's generations list and seeds the batch query
 * cache with the returned batch. Returns the `BatchResponse` so the
 * caller can navigate to /generate the batch view.
 */
export function useCreateBatch(roomId: string) {
  const qc = useQueryClient();
  return useMutation<BatchResponse, Error, CreateBatchInput>({
    mutationFn: (input) => createBatch(roomId, input),
    onSuccess: async (batch) => {
      await qc.invalidateQueries({ queryKey: generationsByRoomQueryKey(roomId) });
      qc.setQueryData(batchQueryKey(roomId, batch.batchId), batch);
    },
  });
}

/**
 * Mutation hook for `POST /api/rooms/:id/approval { generationId }`.
 * On success, invalidates the room query (status flips to APPROVED)
 * and the generations list (the approved row's status may surface).
 */
export function useApproveGeneration(roomId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { generationId: string }>({
    mutationFn: (input) => approve(roomId, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: roomQueryKey(roomId) });
      await qc.invalidateQueries({ queryKey: generationsByRoomQueryKey(roomId) });
    },
  });
}

/**
 * Mutation hook for `POST /api/rooms/:id/reopen`. Invalidates the
 * room query so the UI re-reads the cleared approval.
 */
export function useReopenRoom(roomId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: () => reopen(roomId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: roomQueryKey(roomId) });
      await qc.invalidateQueries({ queryKey: generationsByRoomQueryKey(roomId) });
    },
  });
}