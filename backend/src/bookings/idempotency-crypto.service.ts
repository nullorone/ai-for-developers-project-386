import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../common/config/env.schema';
import type { BookingCreatedDto } from './booking.types';

export interface EncryptedResponse {
  ciphertext: string;
  iv: string;
  authTag: string;
}

@Injectable()
export class IdempotencyCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.key = Buffer.from(config.get<string>('IDEMPOTENCY_ENCRYPTION_KEY'), 'hex');
  }

  encrypt(response: BookingCreatedDto): EncryptedResponse {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(response), 'utf8'),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString('base64url'),
      iv: iv.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
    };
  }

  decrypt(input: EncryptedResponse): BookingCreatedDto {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(input.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(input.authTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as BookingCreatedDto;
  }
}
