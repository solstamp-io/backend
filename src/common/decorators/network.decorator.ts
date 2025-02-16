import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export type NetworkType = 'mainnet' | 'devnet';

export const Network = createParamDecorator(
  (_, context: ExecutionContext): NetworkType => {
    const request = context.switchToHttp().getRequest<Request>();
    const network = request.query.network;
    return network === 'mainnet' ? 'mainnet' : 'devnet';
  },
);
