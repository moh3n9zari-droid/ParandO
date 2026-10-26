import crypto from 'crypto';
import { base64UrlEncode } from './auth_service';

/**
 * TEST-ONLY Token Minting Helper.
 * STRICTLY ISOLATED FOR TEST SUITES AND HARNESSES.
 *
 * Requirements (Task 3):
 * - REQUIRES an explicit secret parameter (no production defaults or fallbacks).
 * - Never imported or used in production routes.
 */
export function generateTestToken(
  payload: any,
  secret: string,
  options?: {
    customHeader?: any;
  }
): string {
  if (!secret || typeof secret !== 'string') {
    throw new Error('generateTestToken requires an explicit secret string');
  }

  const header = options?.customHeader ?? { alg: 'HS256', typ: 'JWT' };
  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64url');

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}
