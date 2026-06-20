import { apiFetch } from './client';

export type GenerationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type GenerationErrorCode =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_BROKEN'
  | 'STORAGE_FAILED'
  | null;

export interface Generation {
  id: string;
  roomId: string;
  batchId: string;
  optionIndex: number;
  parentGenerationId: string | null;
  prompt: string;
  negativePrompt: string | null;
  imageUrl: string | null;
  storageObjectKey: string | null;
  status: GenerationStatus;
  errorCode: GenerationErrorCode;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchResponse {
  batchId: string;
  items: Generation[];
}

/**
 * Compact lineage node — the backend returns only `id`,
 * `optionIndex`, and `createdAt` to keep the payload small (the
 * full Generation record would be re-fetched on demand by the UI).
 */
export interface LineageNode {
  id: string;
  optionIndex: number;
  createdAt: string;
}

export interface LineageResponse {
  root: LineageNode;
  /**
   * Ancestors ordered root→...→parent (excluding the root itself,
   * which is returned separately). Empty for a root generation.
   */
  ancestors: LineageNode[];
  /**
   * Descendants ordered child→...→leaf (excluding the queried
   * generation itself). Empty for a leaf generation.
   */
  descendants: LineageNode[];
}

/**
 * Structured refinement fields, mirroring the backend's
 * `RefinementsDto`. All fields are optional; empty strings are
 * treated as "no change" by the server.
 */
export interface Refinements {
  colors?: string;
  objects?: string;
  furniture?: string;
  materials?: string;
  lighting?: string;
  layout?: string;
  styleEmphasis?: string;
}

export interface CreateBatchInput {
  parentGenerationId?: string;
  refinements?: Refinements;
}

export function createBatch(roomId: string, input: CreateBatchInput = {}): Promise<BatchResponse> {
  return apiFetch<BatchResponse>(`/rooms/${roomId}/generations`, {
    method: 'POST',
    body: input,
  });
}

export function listGenerationsByRoom(roomId: string): Promise<{ items: Generation[] }> {
  return apiFetch<{ items: Generation[] }>(`/rooms/${roomId}/generations`);
}

export function getBatch(roomId: string, batchId: string): Promise<BatchResponse> {
  return apiFetch<BatchResponse>(`/rooms/${roomId}/generations/batches/${batchId}`);
}

export function getLineage(generationId: string): Promise<LineageResponse> {
  return apiFetch<LineageResponse>(`/generations/${generationId}/lineage`);
}

export interface ApproveInput {
  generationId: string;
}

export function approve(roomId: string, input: ApproveInput): Promise<Room> {
  return apiFetch<Room>(`/rooms/${roomId}/approval`, {
    method: 'POST',
    body: input,
  });
}

import type { Room } from './rooms';

export function reopen(roomId: string): Promise<Room> {
  return apiFetch<Room>(`/rooms/${roomId}/reopen`, { method: 'POST' });
}