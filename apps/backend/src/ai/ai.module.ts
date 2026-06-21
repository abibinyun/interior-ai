import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER_ADAPTER, AiProviderAdapter } from './adapters/ai-provider.adapter';
import { FetchHttpFetcher } from './adapters/fetch-http.fetcher';
import { HTTP_FETCHER } from './adapters/pollinations.adapter';
import { AiHordeAdapter } from './adapters/ai-horde.adapter';
import { MyceliAdapter } from './adapters/myceli.adapter';
import { PollinationsAdapter } from './adapters/pollinations.adapter';

@Module({
  providers: [
    FetchHttpFetcher,
    PollinationsAdapter,
    MyceliAdapter,
    AiHordeAdapter,
    {
      provide: HTTP_FETCHER,
      useExisting: FetchHttpFetcher,
    },
    {
      provide: AI_PROVIDER_ADAPTER,
      inject: [ConfigService, PollinationsAdapter, MyceliAdapter, AiHordeAdapter],
      useFactory: (
        config: ConfigService,
        pollinations: PollinationsAdapter,
        myceli: MyceliAdapter,
        aiHorde: AiHordeAdapter,
      ): AiProviderAdapter => {
        // The active provider is selected at boot via the AI_PROVIDER
        // env. The other two are still registered as providers so the
        // pipeline orchestrator can use them as the AI-07 fallback
        // adapter when the primary fails with a transient error
        // (timeout, 5xx, or 402/429).
        const selected = config.get<string>('AI_PROVIDER', 'pollinations');
        switch (selected) {
          case 'myceli':
            return myceli;
          case 'ai-horde':
            return aiHorde;
          case 'pollinations':
          default:
            return pollinations;
        }
      },
    },
  ],
  exports: [AI_PROVIDER_ADAPTER, PollinationsAdapter, MyceliAdapter, AiHordeAdapter, HTTP_FETCHER],
})
export class AiModule {}
