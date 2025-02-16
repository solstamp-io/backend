import { publicKey } from '@metaplex-foundation/umi';
import { z } from 'zod';

export const publicKeySchema = z.string().refine((key) => {
  try {
    publicKey(key);
    return true;
  } catch {
    return false;
  }
});
