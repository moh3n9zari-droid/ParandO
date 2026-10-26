import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export type UserRole = 'OFFERER' | 'SELLER' | 'EXCHANGE_ADMIN' | 'AUDITOR';

export const SUPPORTED_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'OFFERER',
  'SELLER',
  'EXCHANGE_ADMIN',
  'AUDITOR',
]);

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly tenantId: string;
  readonly roles: readonly UserRole[];
  readonly isEligible: boolean;
}

export interface AuthTokenPayload {
  readonly sub: string;        // userId (must be non-empty string)
  readonly tid: string;        // tenantId (must be non-empty string)
  readonly roles: readonly UserRole[]; // non-empty array containing only supported roles
  readonly eligible: boolean;  // server-verified eligibility (strict boolean)
  readonly exp: number;        // expiration timestamp in epoch seconds (strictly required, numeric, future)
  readonly iat?: number;       // issued-at in epoch seconds (optional, numeric if present)
}

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
    }
  }
}

/**
 * Retrieves the configured authentication secret from the server environment.
 * CRITICAL (AC-01, AC-02): Zero fallback to deterministic, hardcoded, or test-derived strings.
 * If PARANDO_AUTH_SECRET is unset or empty, returns null to force fail-closed behavior.
 */
export function getAuthSecret(): string | null {
  const secret = process.env.PARANDO_AUTH_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    return null;
  }
  return secret;
}

/**
 * Base64 URL encoding helper
 */
export function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64 URL decoding helper
 */
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export type TokenVerificationError =
  | 'TRUST_CONFIGURATION_MISSING'
  | 'MISSING_TOKEN'
  | 'MALFORMED_HEADER'
  | 'INVALID_STRUCTURE'
  | 'UNSUPPORTED_ALGORITHM'
  | 'INVALID_SIGNATURE'
  | 'INVALID_PAYLOAD'
  | 'INVALID_EXPIRATION'
  | 'EXPIRED_TOKEN'
  | 'INVALID_ROLES';

export interface TokenVerificationResult {
  readonly valid: boolean;
  readonly principal?: AuthenticatedPrincipal;
  readonly error?: TokenVerificationError;
  readonly message?: string;
}

/**
 * Verifies a compact HMAC-SHA256 token against the server's configured secret.
 * Enforces:
 * 1. Fail-closed if no secret configured (AC-01, AC-02).
 * 2. Strict HS256 algorithm enforcement.
 * 3. Constant-time cryptographic signature comparison (AC-05).
 * 4. Strict required numeric future `exp` claim (AC-03).
 * 5. Strict identity, tenant, boolean eligibility, and supported roles validation (AC-04).
 */
export function verifyToken(
  token: string,
  secretOverride?: string
): TokenVerificationResult {
  const secret = secretOverride ?? getAuthSecret();
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    return {
      valid: false,
      error: 'TRUST_CONFIGURATION_MISSING',
      message: 'Authentication trust configuration (PARANDO_AUTH_SECRET) is missing on server. Failing closed.',
    };
  }

  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'MISSING_TOKEN', message: 'Token string missing' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'INVALID_STRUCTURE', message: 'Token structure must be header.payload.signature' };
  }

  const [headerEnc, payloadEnc, signatureEnc] = parts;

  // 1. Verify header
  let header: any;
  try {
    header = JSON.parse(base64UrlDecode(headerEnc));
  } catch {
    return { valid: false, error: 'INVALID_STRUCTURE', message: 'Invalid token header encoding' };
  }

  if (!header || typeof header !== 'object' || Array.isArray(header) || header.alg !== 'HS256') {
    return { valid: false, error: 'UNSUPPORTED_ALGORITHM', message: 'Only HS256 algorithm is supported and trusted' };
  }

  // 2. Cryptographic signature check (constant-time comparison)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${headerEnc}.${payloadEnc}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signatureEnc);
  const expectedBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, error: 'INVALID_SIGNATURE', message: 'Cryptographic signature mismatch' };
  }

  // 3. Payload parsing
  let payload: any;
  try {
    payload = JSON.parse(base64UrlDecode(payloadEnc));
  } catch {
    return { valid: false, error: 'INVALID_PAYLOAD', message: 'Invalid token payload encoding' };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'INVALID_PAYLOAD', message: 'Token payload must be a JSON object' };
  }

  // 4. Strict identity claims validation (sub and tid)
  if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    return { valid: false, error: 'INVALID_PAYLOAD', message: 'Token payload missing valid non-empty "sub" identity claim' };
  }

  if (typeof payload.tid !== 'string' || payload.tid.trim().length === 0) {
    return { valid: false, error: 'INVALID_PAYLOAD', message: 'Token payload missing valid non-empty "tid" tenant claim' };
  }

  // 5. Strict eligibility claim validation (strict boolean only)
  if (typeof payload.eligible !== 'boolean') {
    return { valid: false, error: 'INVALID_PAYLOAD', message: 'Token payload "eligible" claim must be a strict boolean' };
  }

  // 6. Strict roles validation (must be non-empty array of explicitly supported UserRole)
  if (!Array.isArray(payload.roles) || payload.roles.length === 0) {
    return { valid: false, error: 'INVALID_ROLES', message: 'Token payload "roles" must be a non-empty array' };
  }

  for (const r of payload.roles) {
    if (typeof r !== 'string' || !SUPPORTED_ROLES.has(r as UserRole)) {
      return { valid: false, error: 'INVALID_ROLES', message: `Unsupported or invalid role claim: '${r}'` };
    }
  }

  // 7. Strict mandatory expiration validation (AC-03)
  if (payload.exp === undefined || payload.exp === null) {
    return { valid: false, error: 'INVALID_EXPIRATION', message: 'Token missing required "exp" expiration claim' };
  }

  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return { valid: false, error: 'INVALID_EXPIRATION', message: 'Token "exp" claim must be a valid numeric timestamp' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return { valid: false, error: 'EXPIRED_TOKEN', message: `Token expired at ${payload.exp} (current time: ${now})` };
  }

  // 8. Optional iat validation if provided
  if (payload.iat !== undefined && payload.iat !== null) {
    if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) {
      return { valid: false, error: 'INVALID_PAYLOAD', message: 'Token "iat" claim must be numeric when present' };
    }
    // Allow reasonable clock skew of 60 seconds
    if (payload.iat > now + 60) {
      return { valid: false, error: 'INVALID_PAYLOAD', message: 'Token "iat" is in the future beyond clock skew allowance' };
    }
    if (payload.iat > payload.exp) {
      return { valid: false, error: 'INVALID_PAYLOAD', message: 'Token "iat" cannot be after "exp"' };
    }
  }

  const principal: AuthenticatedPrincipal = {
    userId: payload.sub.trim(),
    tenantId: payload.tid.trim(),
    roles: Object.freeze([...payload.roles] as UserRole[]),
    isEligible: payload.eligible,
  };

  return { valid: true, principal };
}

/**
 * Extracts Bearer token from the Authorization header and verifies it.
 * Populates req.principal if valid. Does not block unauthenticated requests.
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
      detail: `Invalid or untrusted credentials: ${result.message || result.error || 'Verification failed'}.`,
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
