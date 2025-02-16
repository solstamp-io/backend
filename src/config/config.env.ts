import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['local', 'development', 'production']),
  PORT: z.string().transform((val) => parseInt(val, 10)),
  DEVNET_SOLANA_RPC_BACKEND: z.string().url(),
  MAINNET_SOLANA_RPC_BACKEND: z.string().url(),
  DEVNET_IRYS_URL: z.string().url(),
  MAINNET_IRYS_URL: z.string().url(),
  WALLET_PRIVATE_KEY: z
    .string()
    .transform((val) => JSON.parse(val) as number[]),
});

export type Env = z.infer<typeof envSchema>;

export const validate = (config: Record<string, unknown>) => {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error('Invalid environment variables');
  }
  return parsed.data;
};
