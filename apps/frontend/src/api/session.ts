import { apiFetch } from './client';

export interface SessionResponse {
  sessionId: string;
  createdAt: string;
}

export function getSession(): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/session');
}