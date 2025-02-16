import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { publicKeySchema } from '../schemas/public-key.schema';

@Injectable()
export class PublicKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['public-key'];

    if (!providedKey) {
      throw new UnauthorizedException('Public key is required');
    }

    try {
      publicKeySchema.parse(providedKey);
      return true;
    } catch {
      throw new UnauthorizedException('Public key is invalid');
    }
  }
}
