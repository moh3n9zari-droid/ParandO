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
import { generateToken, AuthTokenPayload } from '../src/auth/auth_service';

/**
 * P0-02 Security, Authentication, Authorization & Tenant Isolation Regression Suite
 *
 * Covers:
 * AC-01: Explicit server-enforced authentication boundary for all sensitive routes
 * AC-02: Rejection of unauthenticated requests on offers, proofs, events, settlement
 * AC-03: Rejection of invalid, expired, malformed, or untrusted credentials
 * AC-04: Server-side RBAC enforcement for every sensitive operation
 * AC-05: Strict tenant isolation across all reads and writes
 * AC-06: Immunity to client-supplied identity, tenant, role, and eligibility spoofing
 * AC-07: Scope-limited reads on proofs and audit events
 * AC-08: Zero side effects on unauthorized settlement attempts
 * AC-09: Deterministic negative test cases for all failure modes
 * AC-10: Preservation of public endpoints and authorized operations
 */

export async function runSecurityRegressionTests(): Promise<void> {
  console.log('\n=============================================================');
  console.log('ParandO P0-02 Security & RBAC Regression Verification Suite');
  console.log('Scope: SERVER-SIDE AUTH, AUTHZ, TENANT ISOLATION & OWNERSHIP');
  console.log('=============================================================\n');

  const port = await getFreePort();
  console.log(`[P0-02 Test] Spawning server on ephemeral port ${port}...`);
  const serverProcess = spawnProductionServer(port);

  try {
    await waitForServerReady(serverProcess, port);
    console.log(`Server ready on port ${port}. Commencing security test matrix...\n`);

    // -------------------------------------------------------------------------
    // Synthetic Identities & Token Generation (AC-11: Zero real secrets/data)
    // -------------------------------------------------------------------------
    const now = Math.floor(Date.now() / 1000);

    const validOffererPayload: AuthTokenPayload = {
      sub: 'offerer-alpha',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
    };
    const validOffererToken = generateToken(validOffererPayload);

    const ineligibleOffererPayload: AuthTokenPayload = {
      sub: 'offerer-ineligible',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: false,
    };
    const ineligibleOffererToken = generateToken(ineligibleOffererPayload);

    const foreignTenantOffererPayload: AuthTokenPayload = {
      sub: 'offerer-energy',
      tid: 'tenant-energy-bourse',
      roles: ['OFFERER'],
      eligible: true,
    };
    const foreignTenantOffererToken = generateToken(foreignTenantOffererPayload);

    const sellerPayload: AuthTokenPayload = {
      sub: 'central-bullion-vault',
      tid: 'tenant-gold-bourse',
      roles: ['SELLER'],
      eligible: true,
    };
    const sellerToken = generateToken(sellerPayload);

    const goldAdminPayload: AuthTokenPayload = {
      sub: 'admin-gold-officer',
      tid: 'tenant-gold-bourse',
      roles: ['EXCHANGE_ADMIN'],
      eligible: true,
    };
    const goldAdminToken = generateToken(goldAdminPayload);

    const foreignAdminPayload: AuthTokenPayload = {
      sub: 'admin-energy-officer',
      tid: 'tenant-energy-bourse',
      roles: ['EXCHANGE_ADMIN'],
      eligible: true,
    };
    const foreignAdminToken = generateToken(foreignAdminPayload);

    const auditorPayload: AuthTokenPayload = {
      sub: 'auditor-gold',
      tid: 'tenant-gold-bourse',
      roles: ['AUDITOR'],
      eligible: true,
    };
    const auditorToken = generateToken(auditorPayload);

    const expiredToken = generateToken(validOffererPayload, undefined, -60); // expired 60s ago
    const untrustedKeyToken = generateToken(validOffererPayload, 'foreign-untrusted-key-xyz');

    // Tampered token (header.payload.signature where payload string is tampered)
    const validParts = validOffererToken.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...validOffererPayload, sub: 'offerer-tampered-hacker' })
    )
      .toString('base64')
      .replace(/=/g, '');
    const tamperedToken = `${validParts[0]}.${tamperedPayload}.${validParts[2]}`;

    // -------------------------------------------------------------------------
    // SECTION 1: Unauthenticated Access Rejections (AC-01, AC-02)
    // -------------------------------------------------------------------------
    console.log('[SECTION 1] Validating Unauthenticated Requests to Sensitive Routes (401 Rejections)...');

    // 1.1 Unauthenticated Offer Submission
    const unauthOffer = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/competitions/COMP-GOLD-001/offers',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({ amount: 43_000_000_000, offerer_id: 'offerer-alpha', tenant_id: 'tenant-gold-bourse' })
    );
    assert(unauthOffer.status === 401, 'Unauthenticated POST /offers returned 401 Unauthorized');
    const unauthOfferJson = JSON.parse(unauthOffer.body);
    assert(unauthOfferJson.error === 'UNAUTHORIZED', 'Unauthenticated offer body contains error UNAUTHORIZED');

    // 1.2 Unauthenticated Proof Creation
    const unauthProofPost = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/proofs',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({ offerer_id: 'offerer-alpha', tenant_id: 'tenant-gold-bourse', guaranteed_amount: 100_000_000 })
    );
    assert(unauthProofPost.status === 401, 'Unauthenticated POST /proofs returned 401 Unauthorized');

    // 1.3 Unauthenticated Proof Read
    const unauthProofGet = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/proofs/offerer-alpha',
      method: 'GET',
    });
    assert(unauthProofGet.status === 401, 'Unauthenticated GET /proofs/:id returned 401 Unauthorized');

    // 1.4 Unauthenticated Audit Events Read
    const unauthEvents = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/events',
      method: 'GET',
    });
    assert(unauthEvents.status === 401, 'Unauthenticated GET /events returned 401 Unauthorized');

    // 1.5 Unauthenticated Settlement Execution
    const unauthSettle = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/settle',
      method: 'POST',
    });
    assert(unauthSettle.status === 401, 'Unauthenticated POST /settle returned 401 Unauthorized');

    // 1.6 Unauthenticated Competition Creation
    const unauthCompPost = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/competitions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({ competition_id: 'COMP-FAKE-001', tenant_id: 'tenant-gold-bourse', seller_id: 'seller-1' })
    );
    assert(unauthCompPost.status === 401, 'Unauthenticated POST /competitions returned 401 Unauthorized');

    // -------------------------------------------------------------------------
    // SECTION 2: Invalid / Untrusted / Malformed Credentials (AC-03)
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 2] Validating Malformed & Untrusted Credentials (401 Rejections)...');

    // 2.1 Malformed header scheme (e.g. Basic instead of Bearer)
    const badSchemeRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic dXNlcjpwYXNz',
      },
    });
    assert(badSchemeRes.status === 401, 'Malformed scheme "Basic" returned 401 Unauthorized');

    // 2.2 Malformed token structure (not 3 dot-separated parts)
    const badStructureRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid.token',
      },
    });
    assert(badStructureRes.status === 401, 'Malformed token structure returned 401 Unauthorized');

    // 2.3 Untrusted signing key
    const untrustedKeyRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${untrustedKeyToken}`,
      },
    });
    assert(untrustedKeyRes.status === 401, 'Token signed with untrusted secret returned 401 Unauthorized');

    // 2.4 Cryptographic signature tampering
    const tamperedRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tamperedToken}`,
      },
    });
    assert(tamperedRes.status === 401, 'Tampered token payload returned 401 Unauthorized');

    // 2.5 Expired token
    const expiredRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expiredToken}`,
      },
    });
    assert(expiredRes.status === 401, 'Expired token returned 401 Unauthorized');

    // 2.6 Client arbitrary header spoofing (e.g. X-User-Id, X-Role without Bearer token)
    const headerSpoofRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/offers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'offerer-alpha',
        'X-Role': 'EXCHANGE_ADMIN',
        'X-Tenant-Id': 'tenant-gold-bourse',
        'X-Eligible': 'true',
      },
    });
    assert(headerSpoofRes.status === 401, 'Arbitrary client header spoofing rejected with 401 Unauthorized');

    // -------------------------------------------------------------------------
    // SECTION 3: Server-Side RBAC Enforcement (AC-04)
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 3] Validating Server-Side Role-Based Access Control (403 Rejections)...');

    // 3.1 Auditor role attempting to submit an offer
    const auditorOfferRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/competitions/COMP-GOLD-001/offers',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auditorToken}`,
        },
      },
      JSON.stringify({ amount: 43_000_000_000 })
    );
    assert(auditorOfferRes.status === 403, 'Auditor role attempting POST /offers returned 403 Forbidden');

    // 3.2 Offerer attempting to settle a competition
    const offererSettleRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/settle',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validOffererToken}`,
      },
    });
    assert(offererSettleRes.status === 403, 'Offerer role attempting POST /settle returned 403 Forbidden');

    // 3.3 Offerer attempting to create/mint commitment proofs
    const offererProofPostRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/proofs',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validOffererToken}`,
        },
      },
      JSON.stringify({ offerer_id: 'offerer-alpha', tenant_id: 'tenant-gold-bourse', guaranteed_amount: 500_000_000_000 })
    );
    assert(offererProofPostRes.status === 403, 'Offerer attempting to create commitment proof returned 403 Forbidden');

    // 3.4 Offerer attempting to dump audit events
    const offererEventsRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/events',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${validOffererToken}`,
      },
    });
    assert(offererEventsRes.status === 403, 'Offerer attempting to read audit events returned 403 Forbidden');

    // 3.5 Offerer attempting to create a competition
    const offererCompPostRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/competitions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validOffererToken}`,
        },
      },
      JSON.stringify({
        competition_id: 'COMP-ILLEGAL-001',
        tenant_id: 'tenant-gold-bourse',
        seller_id: 'offerer-alpha',
        base_price: 1_000_000,
        min_increment: 100_000,
        deposit_rate_bps: 1500,
      })
    );
    assert(offererCompPostRes.status === 403, 'Offerer attempting to create competition returned 403 Forbidden');

    // -------------------------------------------------------------------------
    // SECTION 4: Strict Tenant Isolation (AC-05)
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 4] Validating Multi-Tenant Isolation Enforcement (403 Rejections)...');

    // 4.1 Offerer from tenant-energy-bourse bidding on COMP-GOLD-001 (tenant-gold-bourse)
    const crossTenantOffer = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/competitions/COMP-GOLD-001/offers',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${foreignTenantOffererToken}`,
        },
      },
      JSON.stringify({ amount: 43_000_000_000 })
    );
    assert(crossTenantOffer.status === 403, 'Cross-tenant offer submission rejected with 403 Forbidden');
    const crossTenantJson = JSON.parse(crossTenantOffer.body);
    assert(crossTenantJson.detail.includes('TENANT_MISMATCH'), 'Error detail explicitly confirms TENANT_MISMATCH');

    // 4.2 Administrator of tenant-energy-bourse attempting to settle COMP-GOLD-001
    const crossTenantSettle = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/settle',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${foreignAdminToken}`,
      },
    });
    assert(crossTenantSettle.status === 403, 'Cross-tenant settlement attempt rejected with 403 Forbidden');

    // 4.3 Administrator of tenant-energy-bourse attempting to issue proof in tenant-gold-bourse
    const crossTenantProof = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/proofs',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${foreignAdminToken}`,
        },
      },
      JSON.stringify({ offerer_id: 'offerer-alpha', tenant_id: 'tenant-gold-bourse', guaranteed_amount: 50_000_000 })
    );
    assert(crossTenantProof.status === 403, 'Cross-tenant proof issuance rejected with 403 Forbidden');

    // -------------------------------------------------------------------------
    // SECTION 5: Ownership Enforcement & Client Spoofing Immunity (AC-06)
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 5] Validating Ownership Enforcement & Spoofing Immunity (AC-06)...');

    // 5.1 Authenticated offerer 'offerer-alpha' attempts to submit an offer as 'offerer-beta'
    const spoofIdentityOffer = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/competitions/COMP-GOLD-001/offers',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validOffererToken}`, // token is offerer-alpha
        },
      },
      JSON.stringify({
        amount: 43_000_000_000,
        offerer_id: 'offerer-beta', // body spoof
      })
    );
    assert(spoofIdentityOffer.status === 403, 'Client-supplied identity spoofing rejected with 403 Forbidden');

    // 5.2 Offerer with isEligible=false in token claims isEligible=true in body
    const spoofEligibilityOffer = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/competitions/COMP-GOLD-001/offers',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ineligibleOffererToken}`,
        },
      },
      JSON.stringify({
        amount: 43_000_000_000,
        isEligible: true, // client attempts to grant eligibility
      })
    );
    assert(spoofEligibilityOffer.status === 403, 'Ineligible offerer rejected with 403 despite client isEligible=true');
    const ineligJson = JSON.parse(spoofEligibilityOffer.body);
    assert(ineligJson.detail.includes('OFFERER_NOT_ELIGIBLE'), 'Error details confirm OFFERER_NOT_ELIGIBLE');

    // 5.3 Seller cannot offer on their own auction
    const sellerOwnOffer = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/competitions/COMP-GOLD-001/offers',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`, // sub: central-bullion-vault (seller of COMP-GOLD-001)
        },
      },
      JSON.stringify({ amount: 43_000_000_000 })
    );
    assert(sellerOwnOffer.status === 403, 'Seller offering on own competition rejected with 403 Forbidden');

    // -------------------------------------------------------------------------
    // SECTION 6: Scope-Restricted Reads (AC-07)
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 6] Validating Scope-Restricted Reads on Proofs & Events (AC-07)...');

    // 6.1 Offerer 'offerer-alpha' attempts to inspect 'offerer-beta' proofs
    const foreignProofInspect = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/proofs/offerer-beta',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${validOffererToken}`, // offerer-alpha
      },
    });
    assert(foreignProofInspect.status === 403, 'Offerer reading another offerer proofs rejected with 403 Forbidden');

    // 6.2 Offerer 'offerer-alpha' inspects their own proofs -> 200 OK
    const ownProofInspect = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/proofs/offerer-alpha',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${validOffererToken}`,
      },
    });
    assert(ownProofInspect.status === 200, 'Offerer reading own proofs returned HTTP 200 OK');
    const ownProofs = JSON.parse(ownProofInspect.body);
    assert(Array.isArray(ownProofs) && ownProofs.length > 0, 'Returned valid list of own commitment proofs');

    // 6.3 Auditor in tenant-gold-bourse inspects events -> 200 OK, scoped to tenant
    const auditorEventsRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/events',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auditorToken}`,
      },
    });
    assert(auditorEventsRes.status === 200, 'Auditor reading events returned HTTP 200 OK');
    const eventsList = JSON.parse(auditorEventsRes.body);
    assert(Array.isArray(eventsList), 'Audit events returned as an array');
    assert(
      eventsList.every((e: any) => !e.tenant_id || e.tenant_id === 'tenant-gold-bourse'),
      'Returned audit events strictly scoped to tenant-gold-bourse'
    );

    // -------------------------------------------------------------------------
    // SECTION 7: Settlement Authorization & Zero Side Effects (AC-08)
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 7] Validating Settlement Security & Zero Side Effects (AC-08)...');

    // Check competition state before unauthorized settlement attempt
    const compBefore = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001',
      method: 'GET',
    });
    const compBeforeJson = JSON.parse(compBefore.body);
    assert(compBeforeJson.status === 'ACTIVE', 'Competition is currently ACTIVE');

    // Unauthorized settlement attempt by offerer
    const unauthSettleAttempt = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/settle',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validOffererToken}`,
      },
    });
    assert(unauthSettleAttempt.status === 403, 'Unauthorized settlement returned 403 Forbidden');

    // Verify competition state is UNMODIFIED (zero side effects)
    const compAfter = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001',
      method: 'GET',
    });
    const compAfterJson = JSON.parse(compAfter.body);
    assert(compAfterJson.status === 'ACTIVE', 'Competition remains ACTIVE after rejected settlement attempt');
    assert(compAfterJson.version === compBeforeJson.version, 'Competition version is unchanged after rejected settlement');

    // -------------------------------------------------------------------------
    // SECTION 8: Preservation of Public Read-Only Endpoints (AC-10)
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 8] Validating Preservation of Public Read-Only Endpoints (AC-10)...');

    const pubHealth = await httpRequest({ hostname: '127.0.0.1', port, path: '/health', method: 'GET' });
    assert(pubHealth.status === 200, 'Public GET /health is accessible without token');

    const pubV1Health = await httpRequest({ hostname: '127.0.0.1', port, path: '/api/v1/health', method: 'GET' });
    assert(pubV1Health.status === 200, 'Public GET /api/v1/health is accessible without token');

    const pubComps = await httpRequest({ hostname: '127.0.0.1', port, path: '/api/v1/competitions', method: 'GET' });
    assert(pubComps.status === 200, 'Public GET /api/v1/competitions is accessible without token');

    const pubCompDetail = await httpRequest({ hostname: '127.0.0.1', port, path: '/api/v1/competitions/COMP-GOLD-001', method: 'GET' });
    assert(pubCompDetail.status === 200, 'Public GET /competitions/:id is accessible without token');

    const pubLadder = await httpRequest({ hostname: '127.0.0.1', port, path: '/api/v1/competitions/COMP-GOLD-001/ladder', method: 'GET' });
    assert(pubLadder.status === 200, 'Public GET /competitions/:id/ladder is accessible without token');

    // -------------------------------------------------------------------------
    // SECTION 9: Authorized Writes & Financial Integrity (AC-10)
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 9] Validating Authorized Operations & TR-12 Replay (AC-10)...');

    // 9.1 Authorized offer placement by valid offerer
    const validOfferRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/competitions/COMP-GOLD-001/offers',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validOffererToken}`,
          'Idempotency-Key': 'IDEM-TEST-SEC-001',
        },
      },
      JSON.stringify({
        amount: 43_000_000_000,
        expected_version: compAfterJson.version,
      })
    );
    assert(validOfferRes.status === 200, 'Authorized offer submission returned 200 OK');
    const validOfferJson = JSON.parse(validOfferRes.body);
    assert(validOfferJson.success === true, 'Authorized offer submission succeeded');
    assert(validOfferJson.offer.offerer_id === 'offerer-alpha', 'Offer placed under verified principal userId');

    // 9.2 TR-12 Identical Replay succeeds with replay header
    const replayRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/competitions/COMP-GOLD-001/offers',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validOffererToken}`,
          'Idempotency-Key': 'IDEM-TEST-SEC-001',
        },
      },
      JSON.stringify({
        amount: 43_000_000_000,
        expected_version: compAfterJson.version,
      })
    );
    assert(replayRes.status === 200, 'TR-12 identical replay returned 200 OK');
    assert(replayRes.headers['x-idempotency-replay'] === 'true', 'TR-12 identical replay returned X-Idempotency-Replay header');

    // 9.3 Authorized proof creation by goldAdmin
    const authProofRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/v1/proofs',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${goldAdminToken}`,
        },
      },
      JSON.stringify({
        offerer_id: 'offerer-alpha',
        tenant_id: 'tenant-gold-bourse',
        guaranteed_amount: 300_000_000_000,
        valid_hours: 72,
      })
    );
    assert(authProofRes.status === 200, 'Authorized proof creation by exchange admin returned 200 OK');

    // 9.4 Authorized settlement by goldAdmin
    const authSettleRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions/COMP-GOLD-001/settle',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${goldAdminToken}`,
      },
    });
    assert(authSettleRes.status === 200, 'Authorized settlement by gold admin returned 200 OK');
    const authSettleJson = JSON.parse(authSettleRes.body);
    assert(authSettleJson.status === 'SETTLED', 'Competition successfully settled with SHA-256 voucher');
    assert(authSettleJson.voucher.winner_id === 'offerer-alpha', 'Winner correctly attributed in settlement voucher');

    console.log('\n=============================================================');
    console.log('ALL P0-02 SECURITY & RBAC REGRESSION TESTS PASSED (100% SUCCESS)');
    console.log('=============================================================\n');
  } finally {
    console.log('[P0-02 Test] Cleaning up server processes...');
    await terminateServerGracefully(serverProcess, 'SIGTERM', 4000);
    await waitForPortFree(port);
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
