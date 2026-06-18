import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER_ADAPTER, AiProviderAdapter } from './adapters/ai-provider.adapter';
import { FetchHttpFetcher } from './adapters/fetch-http.fetcher';
import { HTTP_FETCHER } from './adapters/pollinations.adapter';
import { MyceliAdapter } from './adapters/myceli.adapter';
import { PollinationsAdapter } from './adapters/pollinations.adapter';

@Module({
  providers: [
    FetchHttpFetcher,
    PollinationsAdapter,
    MyceliAdapter,
    {
      provide: HTTP_FETCHER,
      useExisting: FetchHttpFetcher,
    },
    {
      provide: AI_PROVIDER_ADAPTER,
      inject: [ConfigService, PollinationsAdapter, MyceliAdapter],
      useFactory: (
        config: ConfigService,
        pollinations: PollinationsAdapter,
        myceli: MyceliAdapter,
      ): AiProviderAdapter => {
        const selected = config.get<string>('AI_PROVIDER', 'pollinations');
        if (selected === 'myceli') return myceli;
        return pollinations;
      },
    },
  ],
  exports: [AI_PROVIDER_ADAPTER],
})
export class AiModule {}
