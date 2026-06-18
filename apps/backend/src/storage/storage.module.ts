import { Module } from '@nestjs/common';
import { FetchHttpFetcher } from '../ai/adapters/fetch-http.fetcher';
import { HTTP_FETCHER } from '../ai/adapters/pollinations.adapter';
import { STORAGE_ADAPTER } from './storage.adapter';
import { SupabaseStorageAdapter } from './supabase-storage.adapter';

@Module({
  providers: [
    SupabaseStorageAdapter,
    {
      provide: HTTP_FETCHER,
      useExisting: FetchHttpFetcher,
    },
    {
      provide: STORAGE_ADAPTER,
      useExisting: SupabaseStorageAdapter,
    },
  ],
  exports: [STORAGE_ADAPTER, SupabaseStorageAdapter],
})
export class StorageModule {}
