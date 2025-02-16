import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { publicKeySchema } from '../schemas/public-key.schema';

export const PublicKey = createParamDecorator(
  (_, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['public-key'];

    if (!providedKey) {
      throw new UnauthorizedException('Public key is required');
    }

    try {
      return publicKeySchema.parse(providedKey);
    } catch {
      throw new UnauthorizedException('Public key is invalid');
    }
  },
);
