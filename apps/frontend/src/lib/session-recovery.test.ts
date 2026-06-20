import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handle401, resetSessionReloadLatch } from './session-recovery';
import { ApiError } from './error';

describe('handle401', () => {
  const realLocation = window.location;

  beforeEach(() => {
    resetSessionReloadLatch();
    // jsdom's window.location.reload is a no-op stub; install a spy.
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...realLocation,
      reload: vi.fn(),
    } as Location);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSessionReloadLatch();
  });

  it('schedules a reload on a 401 ApiError', async () => {
    handle401(new ApiError(401, 'UNAUTHENTICATED'));
    // The reload is deferred to setTimeout(..., 100).
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing for non-401 errors', async () => {
    handle401(new ApiError(500, 'INTERNAL'));
    handle401(new ApiError(404, 'NOT_FOUND'));
    handle401(new Error('boom'));
    handle401('boom');
    handle401(null);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('does not schedule more than one reload per storm (idempotent)', async () => {
    handle401(new ApiError(401, 'UNAUTHENTICATED'));
    handle401(new ApiError(401, 'UNAUTHENTICATED'));
    handle401(new ApiError(401, 'UNAUTHENTICATED'));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('resetSessionReloadLatch re-arms the scheduler', async () => {
    handle401(new ApiError(401, 'UNAUTHENTICATED'));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(window.location.reload).toHaveBeenCalledTimes(1);
    resetSessionReloadLatch();
    handle401(new ApiError(401, 'UNAUTHENTICATED'));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(window.location.reload).toHaveBeenCalledTimes(2);
  });
});
