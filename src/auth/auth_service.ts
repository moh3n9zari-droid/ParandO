import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export type UserRole = 'OFFERER' | 'SELLER' | 'EXCHANGE_ADMIN' | 'AUDITOR';

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly tenantId: string;
  readonly roles: readonly UserRole[];
  readonly isEligible: boolean;
}

export interface AuthTokenPayload {
  readonly sub: string;        // userId
  readonly tid: string;        // tenantId
  readonly roles: readonly UserRole[];
  readonly eligible: boolean;  // server-verified eligibility
  readonly iat?: number;       // issued at (seconds)
  readonly exp?: number;       // expires at (seconds)
}

// Configurable authentication secret. Defaults to deterministic server secret if not provided via env.
const SERVER_AUTH_SECRET =
  process.env.PARANDO_AUTH_SECRET ||
  'parando-national-auction-auth-secret-deterministic-2026';

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
    }
  }
}

/**
 * Base64 URL encoding helper
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64 URL decoding helper
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generate a cryptographically signed HMAC-SHA256 compact token.
 */
export function generateToken(
  payload: AuthTokenPayload,
  secret = SERVER_AUTH_SECRET,
  expiresInSeconds = 3600
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + expiresInSeconds,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64url');

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

export interface TokenVerificationResult {
  readonly valid: boolean;
  readonly principal?: AuthenticatedPrincipal;
  readonly error?: 'MISSING_TOKEN' | 'MALFORMED_HEADER' | 'INVALID_STRUCTURE' | 'UNSUPPORTED_ALGORITHM' | 'INVALID_SIGNATURE' | 'EXPIRED_TOKEN' | 'INVALID_PAYLOAD';
  readonly message?: string;
}

/**
 * Verifies a compact HMAC-SHA256 token against the server secret.
 * Enforces constant-time signature comparison to eliminate timing side-channels.
 */
export function verifyToken(
  token: string,
  secret = SERVER_AUTH_SECRET
): TokenVerificationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'MISSING_TOKEN', message: 'Token string missing' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'INVALID_STRUCTURE', message: 'Token structure must be header.payload.signature' };
  }

  const [headerEnc, payloadEnc, signatureEnc] = parts;

  // 1. Verify header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerEnc));
  } catch {
    return { valid: false, error: 'INVALID_STRUCTURE', message: 'Invalid token header encoding' };
  }

  if (header.alg !== 'HS256') {
    return { valid: false, error: 'UNSUPPORTED_ALGORITHM', message: 'Only HS256 algorithm is trusted' };
  }

  // 2. Cryptographic signature check (constant-time)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${headerEnc}.${payloadEnc}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signatureEnc);
  const expectedBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, error: 'INVALID_SIGNATURE', message: 'Cryptographic signature mismatch' };
  }

  // 3. Payload parsing & schema validation
  let payload: AuthTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadEnc));
  } catch {
    return { valid: false, error: 'INVALID_PAYLOAD', message: 'Invalid token payload encoding' };
  }

  if (
    !payload.sub ||
    typeof payload.sub !== 'string' ||
    !payload.tid ||
    typeof payload.tid !== 'string' ||
    !Array.isArray(payload.roles) ||
    typeof payload.eligible !== 'boolean'
  ) {
    return { valid: false, error: 'INVALID_PAYLOAD', message: 'Token payload missing required identity or role claims' };
  }

  // 4. Expiration check
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) {
    return { valid: false, error: 'EXPIRED_TOKEN', message: 'Token has expired' };
  }

  const principal: AuthenticatedPrincipal = {
    userId: payload.sub,
    tenantId: payload.tid,
    roles: Object.freeze([...payload.roles]),
    isEligible: payload.eligible,
  };

  return { valid: true, principal };
}

/**
 * Extracts Bearer token from the Authorization header and verifies it.
 * Populates req.principal if valid. Does not block unauthenticated requests
 * (use requireAuth to enforce blocking).
 */
export function authenticateRequest(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    // Malformed header, do not populate principal
    return next();
  }

  const token = parts[1];
  const result = verifyToken(token);
  if (result.valid && result.principal) {
    req.principal = result.principal;
  }

  next();
}

/**
 * Middleware: Enforces that a valid authenticated principal exists.
 * Rejects with 401 Unauthorized if missing, malformed, or untrusted.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      detail: 'Authentication required. Missing Authorization: Bearer <token> header.',
    });
    return;
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      detail: 'Malformed Authorization header. Format must be: Bearer <token>.',
    });
    return;
  }

  const token = parts[1];
  const result = verifyToken(token);
  if (!result.valid || !result.principal) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      detail: `Invalid or untrusted credentials: ${result.message || 'Verification failed'}.`,
    });
    return;
  }

  req.principal = result.principal;
  next();
}

/**
 * Middleware: Enforces that the authenticated principal possesses at least one of the required roles.
 * Rejects with 403 Forbidden if not authorized.
 */
export function requireRole(allowedRoles: readonly UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.principal) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        detail: 'Authentication required prior to authorization check.',
      });
      return;
    }

    const hasRole = req.principal.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      res.status(403).json({
        error: 'FORBIDDEN',
        detail: `Access denied. Operation requires one of the following roles: [${allowedRoles.join(', ')}].`,
      });
      return;
    }

    next();
  };
}
