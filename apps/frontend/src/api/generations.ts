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

export interface LineageNode {
  id: string;
  optionIndex: number;
  parentGenerationId: string | null;
  status: GenerationStatus;
  createdAt: string;
}

export interface LineageResponse {
  id: string;
  ancestors: LineageNode[];
  descendants: LineageNode[];
}

export interface CreateBatchInput {
  parentGenerationId?: string;
  refinements?: Record<string, unknown>;
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