import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { Env } from './config.env';

@Injectable()
export class ConfigService {
  constructor(private configService: NestConfigService<Env, true>) {}

  get env(): Env {
    return {
      NODE_ENV: this.configService.get('NODE_ENV', { infer: true }),
      PORT: this.configService.get('PORT', { infer: true }),
      DEVNET_SOLANA_RPC_BACKEND: this.configService.get(
        'DEVNET_SOLANA_RPC_BACKEND',
        {
          infer: true,
        },
      ),
      MAINNET_SOLANA_RPC_BACKEND: this.configService.get(
        'MAINNET_SOLANA_RPC_BACKEND',
        {
          infer: true,
        },
      ),
      DEVNET_IRYS_URL: this.configService.get('DEVNET_IRYS_URL', {
        infer: true,
      }),
      MAINNET_IRYS_URL: this.configService.get('MAINNET_IRYS_URL', {
        infer: true,
      }),
      WALLET_PRIVATE_KEY: this.configService.get('WALLET_PRIVATE_KEY', {
        infer: true,
      }),
    };
  }

  get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development';
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
