import http from 'http';
import {
  getFreePort,
  spawnProductionServer,
  waitForServerReady,
  terminateServerGracefully,
  waitForPortFree,
  cleanupAllAsync,
  httpRequest,
  assert,
} from './production_smoke';
import { generateTestToken } from '../src/auth/test_token_helper';

/**
 * P0-02 Trust-Boundary Security Regression Test Suite
 *
 * Verifies:
 * AC-01: No deterministic or hardcoded production authentication secret remains.
 * AC-02: Missing required authentication configuration fails closed on sensitive routes.
 * AC-03: Strict mandatory numeric future `exp` claim validation.
 * AC-04: Strict claim validation (sub, tid, boolean eligible, supported roles, HS256).
 * AC-05: Constant-time cryptographic signature verification and rejection of untrusted keys.
 * AC-06 / AC-07: Verifier accepts only credentials through established trust boundary; fails closed when absent.
 * AC-08: Existing P0-02 role, tenant, ownership, and eligibility checks remain effective.
 * AC-09: Unauthorized requests produce zero protected writes or settlement side effects.
 * AC-10: Synthetic test identities run without production defaults; public routes preserved.
 */

export async function runSecurityRegressionTests(): Promise<void> {
  console.log('\n=============================================================');
  console.log('ParandO P0-02 Trust-Boundary Security & RBAC Regression Suite');
  console.log('Scope: TRUST BOUNDARY, STRICT CLAIMS, FAIL-CLOSED & TENANT ISOLATION');
  console.log('=============================================================\n');

  // =========================================================================
  // TEST PHASE A: Fail-Closed When Production Secret is Absent (AC-01, AC-02)
  // =========================================================================
  console.log('[PHASE A] Testing Fail-Closed Behavior When PARANDO_AUTH_SECRET Is Unset...');
  const portA = await getFreePort();
  const unconfiguredEnv = { ...process.env };
  delete unconfiguredEnv.PARANDO_AUTH_SECRET;
  delete unconfiguredEnv.PORT;

  const serverProcessA = spawnProductionServer(portA, unconfiguredEnv);
  try {
    await waitForServerReady(serverProcessA, portA);
    console.log(`Unconfigured server ready on port ${portA}. Verifying fail-closed behavior...`);

    // Public route must still function
    const pubHealthA = await httpRequest({ hostname: '127.0.0.1', port: portA, path: '/health', method: 'GET' });
    assert(pubHealthA.status === 200, 'Public GET /health returns 200 even when auth secret is unset');

    // Sensitive route without token must return 401
    const unauthOfferA = await httpRequest({
      hostname: '127.0.0.1',
      port: portA,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(unauthOfferA.status === 401, 'Unconfigured server returns 401 for unauthenticated sensitive request');

    // Attempting to use old hardcoded deterministic fallback secret MUST FAIL CLOSED (AC-01, AC-02)
    const oldHardcodedSecret = 'parando-national-auction-auth-secret-deterministic-2026';
    const oldSecretToken = generateTestToken({
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, oldHardcodedSecret);

    const oldSecretOfferRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portA,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oldSecretToken}`,
      },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(oldSecretOfferRes.status === 401, 'Token signed with old deterministic secret is REJECTED with 401 (Zero fallback)');
    const oldSecretJson = JSON.parse(oldSecretOfferRes.body);
    assert(
      oldSecretJson.detail.includes('missing on server') || oldSecretJson.detail.includes('Failing closed'),
      'Error message explicitly confirms trust configuration is missing and failing closed'
    );

    // Other sensitive routes must also fail closed
    const unconfiguredProof = await httpRequest({
      hostname: '127.0.0.1',
      port: portA,
      path: '/api/v1/proofs',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oldSecretToken}` },
    }, JSON.stringify({ offerer_id: 'offerer-alpha', tenant_id: 'tenant-gold-bourse', guaranteed_amount: 1000 }));
    assert(unconfiguredProof.status === 401, 'POST /proofs fails closed with 401 when auth secret is unset');

    const unconfiguredSettle = await httpRequest({
      hostname: '127.0.0.1',
      port: portA,
      path: '/api/v1/competitions/COMP-GOLD-001/settle',
      method: 'POST',
      headers: { Authorization: `Bearer ${oldSecretToken}` },
    });
    assert(unconfiguredSettle.status === 401, 'POST /settle fails closed with 401 when auth secret is unset');

    console.log('✓ Phase A verified: Missing production auth secret strictly fails closed with zero fallback!\n');
  } finally {
    await terminateServerGracefully(serverProcessA, 'SIGTERM', 4000);
    await waitForPortFree(portA);
    await cleanupAllAsync(2000);
  }

  // =========================================================================
  // TEST PHASE B: Server with Dedicated Synthetic Test Secret (AC-03 - AC-10)
  // =========================================================================
  console.log('[PHASE B] Testing Strict Claims, Cryptographic Signatures, RBAC, and Tenant Isolation...');
  const portB = await getFreePort();
  const SYNTHETIC_TEST_SECRET = 'synthetic-test-secret-min32-chars-entropy-2026-audit!';
  const configuredEnv = {
    ...process.env,
    PARANDO_AUTH_SECRET: SYNTHETIC_TEST_SECRET,
  };
  delete configuredEnv.PORT;

  const serverProcessB = spawnProductionServer(portB, configuredEnv);
  try {
    await waitForServerReady(serverProcessB, portB);
    console.log(`Configured server ready on port ${portB}. Executing security test suite...\n`);

    const now = Math.floor(Date.now() / 1000);

    // Helper to generate test tokens with the synthetic test secret
    const mintToken = (payload: any, options?: { customHeader?: any }, secret = SYNTHETIC_TEST_SECRET) =>
      generateTestToken(payload, secret, options);

    // Standard valid identities
    const validOffererToken = mintToken({
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: now + 3600,
    });

    const foreignTenantToken = mintToken({
      sub: 'offerer-energy',
      tid: 'tenant-energy-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: now + 3600,
    });

    const sellerToken = mintToken({
      sub: 'central-bullion-vault',
      tid: 'tenant-gold-bourse',
      roles: ['SELLER'],
      eligible: true,
      exp: now + 3600,
    });

    const goldAdminToken = mintToken({
      sub: 'admin-gold-officer',
      tid: 'tenant-gold-bourse',
      roles: ['EXCHANGE_ADMIN'],
      eligible: true,
      exp: now + 3600,
    });

    const foreignAdminToken = mintToken({
      sub: 'admin-energy-officer',
      tid: 'tenant-energy-bourse',
      roles: ['EXCHANGE_ADMIN'],
      eligible: true,
      exp: now + 3600,
    });

    const auditorToken = mintToken({
      sub: 'auditor-gold',
      tid: 'tenant-gold-bourse',
      roles: ['AUDITOR'],
      eligible: true,
      exp: now + 3600,
    });

    // -----------------------------------------------------------------------
    // B.1 Mandatory Strict Expiration Claim Validation (AC-03)
    // -----------------------------------------------------------------------
    console.log('[B.1] Validating Mandatory Expiration Claim Validation (AC-03)...');

    // Token WITHOUT exp claim
    const noExpToken = mintToken({
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      // exp is omitted!
    });
    const noExpRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${noExpToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(noExpRes.status === 401, 'Token without "exp" claim rejected with 401 Unauthorized');
    assert(JSON.parse(noExpRes.body).detail.includes('missing required "exp"'), 'Error specifies missing required "exp"');

    // Token with non-numeric string exp
    const stringExpToken = mintToken({
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: '2026-12-31T23:59:59Z',
    });
    const stringExpRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stringExpToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(stringExpRes.status === 401, 'Token with string "exp" claim rejected with 401 Unauthorized');

    // Token with null exp
    const nullExpToken = mintToken({
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: null,
    });
    const nullExpRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nullExpToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(nullExpRes.status === 401, 'Token with null "exp" claim rejected with 401 Unauthorized');

    // Token with expired timestamp (in the past)
    const expiredToken = mintToken({
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: now - 300, // 5 minutes ago
    });
    const expiredRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${expiredToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(expiredRes.status === 401, 'Token with expired timestamp rejected with 401 Unauthorized');
    assert(JSON.parse(expiredRes.body).detail.includes('expired'), 'Error specifies token expired');

    // -----------------------------------------------------------------------
    // B.2 Strict Claim Validation & Unsupported Algorithms (AC-04)
    // -----------------------------------------------------------------------
    console.log('\n[B.2] Validating Strict Claims & Algorithm Validation (AC-04)...');

    // Unsupported algorithm: alg="none"
    const algNoneToken = mintToken(
      { sub: 'offerer-alpha', tid: 'tenant-gold-bourse', roles: ['OFFERER'], eligible: true, exp: now + 3600 },
      { customHeader: { alg: 'none', typ: 'JWT' } }
    );
    const algNoneRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${algNoneToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(algNoneRes.status === 401, 'Header with alg="none" rejected with 401 Unauthorized');

    // Unsupported algorithm: alg="HS512"
    const alg512Token = mintToken(
      { sub: 'offerer-alpha', tid: 'tenant-gold-bourse', roles: ['OFFERER'], eligible: true, exp: now + 3600 },
      { customHeader: { alg: 'HS512', typ: 'JWT' } }
    );
    const alg512Res = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alg512Token}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(alg512Res.status === 401, 'Header with alg="HS512" rejected with 401 Unauthorized');

    // Empty or whitespace-only sub
    const emptySubToken = mintToken({
      sub: '   ',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: now + 3600,
    });
    const emptySubRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${emptySubToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(emptySubRes.status === 401, 'Token with empty/whitespace "sub" rejected with 401 Unauthorized');

    // Non-string sub
    const numberSubToken = mintToken({
      sub: 12345,
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: now + 3600,
    });
    const numberSubRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${numberSubToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(numberSubRes.status === 401, 'Token with non-string "sub" rejected with 401 Unauthorized');

    // Empty or whitespace-only tid
    const emptyTidToken = mintToken({
      sub: 'offerer-alpha',
      tid: '',
      roles: ['OFFERER'],
      eligible: true,
      exp: now + 3600,
    });
    const emptyTidRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${emptyTidToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(emptyTidRes.status === 401, 'Token with empty "tid" rejected with 401 Unauthorized');

    // Non-boolean eligible claim
    const stringEligToken = mintToken({
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: 'true', // string, not boolean!
      exp: now + 3600,
    });
    const stringEligRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stringEligToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(stringEligRes.status === 401, 'Token with non-boolean "eligible" rejected with 401 Unauthorized');

    // Empty roles array
    const emptyRolesToken = mintToken({
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: [],
      eligible: true,
      exp: now + 3600,
    });
    const emptyRolesRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${emptyRolesToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(emptyRolesRes.status === 401, 'Token with empty "roles" array rejected with 401 Unauthorized');

    // Unsupported role
    const badRoleToken = mintToken({
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: ['SUPER_ADMIN'],
      eligible: true,
      exp: now + 3600,
    });
    const badRoleRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${badRoleToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(badRoleRes.status === 401, 'Token with unsupported role "SUPER_ADMIN" rejected with 401 Unauthorized');

    // -----------------------------------------------------------------------
    // B.3 Cryptographic Signature Integrity (AC-05)
    // -----------------------------------------------------------------------
    console.log('\n[B.3] Validating Cryptographic Signature Verification (AC-05)...');

    // Token signed with untrusted / wrong secret
    const wrongSecretToken = mintToken({
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: now + 3600,
    }, undefined, 'wrong-untrusted-key-1234567890!!');
    const wrongSecretRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrongSecretToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(wrongSecretRes.status === 401, 'Token signed with wrong key rejected with 401 Unauthorized');

    // Tampered payload
    const validParts = validOffererToken.split('.');
    const tamperedPayloadB64 = Buffer.from(JSON.stringify({
      sub: 'offerer-tampered-hacker',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: now + 3600,
    })).toString('base64').replace(/=/g, '');
    const tamperedPayloadToken = `${validParts[0]}.${tamperedPayloadB64}.${validParts[2]}`;

    const tamperedPayloadRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tamperedPayloadToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(tamperedPayloadRes.status === 401, 'Tampered token payload rejected with 401 Unauthorized');

    // -----------------------------------------------------------------------
    // B.4 Role-Based Authorization & Tenant Isolation (AC-08)
    // -----------------------------------------------------------------------
    console.log('\n[B.4] Validating RBAC and Multi-Tenant Isolation (AC-08)...');

    // Auditor cannot place offers
    const auditorOfferRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auditorToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(auditorOfferRes.status === 403, 'Auditor role attempting POST /offers rejected with 403 Forbidden');

    // Offerer cannot settle
    const offererSettleRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/settle',
      method: 'POST',
      headers: { Authorization: `Bearer ${validOffererToken}` },
    });
    assert(offererSettleRes.status === 403, 'Offerer role attempting POST /settle rejected with 403 Forbidden');

    // Cross-tenant offer rejected
    const crossTenantOffer = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${foreignTenantToken}` },
    }, JSON.stringify({ amount: 43_000_000_000 }));
    assert(crossTenantOffer.status === 403, 'Cross-tenant offer rejected with 403 Forbidden (TENANT_MISMATCH)');

    // Cross-tenant settlement rejected
    const crossTenantSettle = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/settle',
      method: 'POST',
      headers: { Authorization: `Bearer ${foreignAdminToken}` },
    });
    assert(crossTenantSettle.status === 403, 'Cross-tenant settlement rejected with 403 Forbidden');

    // -----------------------------------------------------------------------
    // B.5 Ownership & Spoofing Immunity (AC-08)
    // -----------------------------------------------------------------------
    console.log('\n[B.5] Validating Identity Ownership & Spoofing Immunity (AC-08)...');

    // Client body offerer_id spoofing
    const bodySpoofRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${validOffererToken}` },
    }, JSON.stringify({ amount: 43_000_000_000, offerer_id: 'offerer-beta' }));
    assert(bodySpoofRes.status === 403, 'Body offerer_id mismatch rejected with 403 Forbidden (IDENTITY_MISMATCH)');

    // Ineligible offerer passing body isEligible: true
    const ineligToken = mintToken({
      sub: 'offerer-ineligible',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: false,
      exp: now + 3600,
    });
    const ineligRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ineligToken}` },
    }, JSON.stringify({ amount: 43_000_000_000, isEligible: true }));
    assert(ineligRes.status === 403, 'Ineligible offerer rejected with 403 despite client body isEligible=true');

    // -----------------------------------------------------------------------
    // B.6 Settlement Protection & Zero Side Effects (AC-09)
    // -----------------------------------------------------------------------
    console.log('\n[B.6] Validating Settlement Security & Zero Side Effects (AC-09)...');

    const compBefore = await httpRequest({ hostname: '127.0.0.1', port: portB, path: '/api/v1/competitions/COMP-GOLD-001', method: 'GET' });
    const compBeforeJson = JSON.parse(compBefore.body);
    assert(compBeforeJson.status === 'ACTIVE', 'Competition is ACTIVE prior to unauthorized settlement');

    const rejectSettle = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/settle',
      method: 'POST',
      headers: { Authorization: `Bearer ${validOffererToken}` },
    });
    assert(rejectSettle.status === 403, 'Unauthorized settlement rejected with 403 Forbidden');

    const compAfter = await httpRequest({ hostname: '127.0.0.1', port: portB, path: '/api/v1/competitions/COMP-GOLD-001', method: 'GET' });
    const compAfterJson = JSON.parse(compAfter.body);
    assert(compAfterJson.status === 'ACTIVE', 'Competition status remains ACTIVE with ZERO side effects');
    assert(compAfterJson.version === compBeforeJson.version, 'Competition version is strictly unchanged');

    // -----------------------------------------------------------------------
    // B.7 Public Endpoints & Authorized Execution (AC-10)
    // -----------------------------------------------------------------------
    console.log('\n[B.7] Validating Public Endpoints & Authorized Execution (AC-10)...');

    const pubComps = await httpRequest({ hostname: '127.0.0.1', port: portB, path: '/api/v1/competitions', method: 'GET' });
    assert(pubComps.status === 200, 'Public GET /api/v1/competitions accessible without token');

    const pubLadder = await httpRequest({ hostname: '127.0.0.1', port: portB, path: '/api/v1/competitions/COMP-GOLD-001/ladder', method: 'GET' });
    assert(pubLadder.status === 200, 'Public GET /api/v1/competitions/:id/ladder accessible without token');

    // Authorized offer submission
    const authOfferRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validOffererToken}`,
        'Idempotency-Key': 'IDEM-SEC-VERIFIED-001',
      },
    }, JSON.stringify({ amount: 43_000_000_000, expected_version: compAfterJson.version }));
    assert(authOfferRes.status === 200, 'Authorized offer submission returns 200 OK');
    const authOfferJson = JSON.parse(authOfferRes.body);
    assert(authOfferJson.offer.offerer_id === 'offerer-alpha', 'Offer attributed strictly to verified principal userId');

    // TR-12 identical replay
    const replayRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validOffererToken}`,
        'Idempotency-Key': 'IDEM-SEC-VERIFIED-001',
      },
    }, JSON.stringify({ amount: 43_000_000_000, expected_version: compAfterJson.version }));
    assert(replayRes.status === 200, 'TR-12 replay returns 200 OK');
    assert(replayRes.headers['x-idempotency-replay'] === 'true', 'Replay header verified on duplicate request');

    // Authorized settlement by goldAdmin
    const authSettleRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/competitions/COMP-GOLD-001/settle',
      method: 'POST',
      headers: { Authorization: `Bearer ${goldAdminToken}` },
    });
    assert(authSettleRes.status === 200, 'Authorized settlement by gold admin returns 200 OK');
    const authSettleJson = JSON.parse(authSettleRes.body);
    assert(authSettleJson.status === 'SETTLED', 'Competition settled and sealed');
    assert(authSettleJson.voucher.winner_id === 'offerer-alpha', 'Winner correctly attributed in SHA-256 voucher');

    console.log('\n=============================================================');
    console.log('ALL P0-02 TRUST-BOUNDARY SECURITY REGRESSION TESTS PASSED (100% SUCCESS)');
    console.log('=============================================================\n');
  } finally {
    console.log('[Phase B Cleanup] Terminating server process...');
    await terminateServerGracefully(serverProcessB, 'SIGTERM', 4000);
    await waitForPortFree(portB);
    await cleanupAllAsync(2000);
  }
}

if (process.argv[1] && process.argv[1].includes('test_security_p0_02')) {
  runSecurityRegressionTests()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('\nSECURITY REGRESSION SUITE FAILED:', err);
      try {
        await cleanupAllAsync(2000);
      } finally {
        process.exit(1);
      }
    });
}
