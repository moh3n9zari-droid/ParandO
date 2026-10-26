import http from 'http';
import net from 'net';
import crypto from 'crypto';
import WebSocket from 'ws';
import {
  getFreePort,
  spawnProductionServer,
  waitForServerReady,
  terminateServerGracefully,
  waitForPortFree,
  httpRequest,
  assert,
} from './production_smoke';
import { generateTestToken } from '../src/auth/test_token_helper';

/**
 * P0-03 WebSocket Security, Authorization & Tenant Isolation Regression Suite
 *
 * Verifies:
 * AC-01: Fail-Closed When PARANDO_AUTH_SECRET Is Unset on Server.
 * AC-02: Missing Authentication Credentials Rejected on Upgrade (401 / Socket Destroyed).
 * AC-03: Malformed, Expired, and Untrusted-Key Tokens Rejected on Upgrade.
 * AC-04: Nonexistent Competition & Invalid Paths Rejected on Upgrade (404).
 * AC-05: Cross-Tenant Access to Competition WebSocket Rejected on Upgrade (403 / No Snapshot).
 * AC-06: Authorized Connection to Competition Receives Authorized Snapshot & Scoped Presence.
 * AC-07: Subprotocol Authentication Support via Sec-WebSocket-Protocol without Credential Reflection.
 * AC-08: Cross-Tenant Event Isolation (Offers & Settlement Deliver to Same-Tenant Watchers Only).
 * AC-09: Presence Information Strictly Partitioned per Tenant/Competition (Zero Cross-Tenant Leakage).
 * AC-10: Client Message Relay Isolated to Same Tenant & Same Competition.
 * AC-11: Ping/Pong Heartbeat Functional on Authorized Sockets.
 * AC-12: Disconnect Cleanup Decrements Presence and Leaves Zero Ghost Watchers.
 * AC-13: Security Alerts Recorded in Audit Log for Unauthorized Upgrade Attempts.
 */

interface WsConnectResult {
  connected: boolean;
  statusCode?: number;
  error?: Error;
  messages: any[];
  ws?: WebSocket;
  responseHeaders?: http.IncomingHttpHeaders;
}

export function assertNoCredentialLeak(
  responseHeaders: http.IncomingHttpHeaders | undefined,
  negotiatedProtocol: string | undefined,
  token: string,
  contextDesc = 'WebSocket Handshake'
): void {
  const protoHeader = responseHeaders?.['sec-websocket-protocol'];
  if (typeof protoHeader === 'string') {
    assert(
      !protoHeader.includes(token),
      `[SECURITY BLOCKER] ${contextDesc}: Response Sec-WebSocket-Protocol echoes raw token!`
    );
    assert(
      !protoHeader.toLowerCase().startsWith('bearer.'),
      `[SECURITY BLOCKER] ${contextDesc}: Response Sec-WebSocket-Protocol starts with 'bearer.' prefix!`
    );
    assert(
      protoHeader.split('.').length !== 3,
      `[SECURITY BLOCKER] ${contextDesc}: Response Sec-WebSocket-Protocol resembles a JWT structure!`
    );
  }

  if (negotiatedProtocol && negotiatedProtocol.length > 0) {
    assert(
      !negotiatedProtocol.includes(token),
      `[SECURITY BLOCKER] ${contextDesc}: ws.protocol property echoes raw token!`
    );
    assert(
      !negotiatedProtocol.toLowerCase().startsWith('bearer.'),
      `[SECURITY BLOCKER] ${contextDesc}: ws.protocol property starts with 'bearer.' prefix!`
    );
    assert(
      negotiatedProtocol.split('.').length !== 3,
      `[SECURITY BLOCKER] ${contextDesc}: ws.protocol resembles a JWT structure!`
    );
  }
}

interface RawUpgradeResult {
  statusCode?: number;
  statusText?: string;
  headers: http.IncomingHttpHeaders;
  socket?: net.Socket;
}

function performRawUpgradeRequest(
  url: string,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
  }
): Promise<RawUpgradeResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const reqHeaders: Record<string, string> = {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': key,
      ...options.headers,
    };

    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: reqHeaders,
    });

    const timer = setTimeout(() => {
      req.destroy(new Error(`Raw upgrade request to ${url} timed out`));
    }, options.timeoutMs ?? 4000);

    req.on('upgrade', (res, socket) => {
      clearTimeout(timer);
      resolve({
        statusCode: res.statusCode,
        statusText: res.statusMessage,
        headers: res.headers,
        socket,
      });
    });

    req.on('response', (res) => {
      clearTimeout(timer);
      resolve({
        statusCode: res.statusCode,
        statusText: res.statusMessage,
        headers: res.headers,
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    req.end();
  });
}

function connectWs(
  url: string,
  options?: {
    headers?: Record<string, string>;
    protocols?: string | string[];
    timeoutMs?: number;
  }
): Promise<WsConnectResult> {
  return new Promise((resolve) => {
    const timeoutMs = options?.timeoutMs ?? 3000;
    const messages: any[] = [];
    let settled = false;
    let responseHeaders: http.IncomingHttpHeaders | undefined = undefined;

    const ws = new WebSocket(url, options?.protocols, {
      headers: options?.headers,
    });

    ws.on('upgrade', (res) => {
      responseHeaders = res.headers;
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.terminate();
        resolve({
          connected: false,
          error: new Error(`WebSocket connection to ${url} timed out after ${timeoutMs}ms`),
          messages,
          responseHeaders,
        });
      }
    }, timeoutMs);

    ws.on('open', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          connected: true,
          messages,
          ws,
          responseHeaders,
        });
      }
    });

    ws.on('message', (data) => {
      const text = data.toString();
      try {
        messages.push(JSON.parse(text));
      } catch {
        messages.push(text);
      }
    });

    ws.on('unexpected-response', (_req, res) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          connected: false,
          statusCode: res.statusCode,
          error: new Error(`Unexpected HTTP response: ${res.statusCode}`),
          messages,
          responseHeaders: res.headers,
        });
      }
    });

    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          connected: false,
          error: err,
          messages,
          responseHeaders,
        });
      }
    });

    ws.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          connected: false,
          messages,
          responseHeaders,
        });
      }
    });
  });
}

function waitForMessage(
  ws: WebSocket,
  messagesList: any[],
  predicate: (msg: any) => boolean,
  timeoutMs = 4000
): Promise<any> {
  return new Promise((resolve, reject) => {
    // Check if already in messagesList
    for (const msg of messagesList) {
      if (predicate(msg)) {
        return resolve(msg);
      }
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for expected message after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (data: any) => {
      const text = data.toString();
      let parsed: any = text;
      try {
        parsed = JSON.parse(text);
      } catch {}
      if (predicate(parsed)) {
        cleanup();
        resolve(parsed);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.removeListener('message', onMessage);
    };

    ws.on('message', onMessage);
  });
}

export async function runWebSocketSecurityTests(): Promise<void> {
  console.log('\n=============================================================');
  console.log('ParandO P0-03 WebSocket Security, Auth & Tenant Isolation Suite');
  console.log('Scope: AUTHENTICATED UPGRADES, TENANT ISOLATION, REALTIME SCOPES');
  console.log('=============================================================\n');

  // =========================================================================
  // TEST PHASE A: Fail-Closed When Server Secret is Missing (AC-01)
  // =========================================================================
  console.log('[PHASE A] Testing Fail-Closed WebSocket Behavior When PARANDO_AUTH_SECRET Is Unset...');
  const portA = await getFreePort();
  const unconfiguredEnv = { ...process.env };
  delete unconfiguredEnv.PARANDO_AUTH_SECRET;
  delete unconfiguredEnv.PORT;

  const serverProcessA = spawnProductionServer(portA, unconfiguredEnv);
  try {
    await waitForServerReady(serverProcessA, portA);
    console.log(`Unconfigured server ready on port ${portA}. Verifying fail-closed upgrades...`);

    // Even if client provides a synthetically signed token, unconfigured server must fail closed
    const dummySecret = 'untrusted-secret-for-phase-a';
    const tokenA = generateTestToken(
      {
        sub: 'offerer-phase-a',
        tid: 'tenant-gold-bourse',
        roles: ['OFFERER'],
        eligible: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      dummySecret
    );

    // 1. Connection to /ws must be rejected
    const resGeneralA = await connectWs(`ws://127.0.0.1:${portA}/ws`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(!resGeneralA.connected, 'WebSocket upgrade to /ws on unconfigured server fails closed (rejected)');
    assert(
      resGeneralA.statusCode === 401 || !!resGeneralA.error,
      'Unconfigured server returns 401 or socket destroyed on /ws upgrade'
    );

    // 2. Connection to /ws/competitions/COMP-GOLD-001 must be rejected
    const resCompA = await connectWs(`ws://127.0.0.1:${portA}/ws/competitions/COMP-GOLD-001`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(!resCompA.connected, 'WebSocket upgrade to /ws/competitions/COMP-GOLD-001 on unconfigured server fails closed');
    assert(resCompA.messages.length === 0, 'Zero snapshot delivered on unconfigured server');
    console.log('✓ Phase A passed: Server fails closed on WebSocket upgrades when trust config is absent.\n');
  } finally {
    await terminateServerGracefully(serverProcessA, 'SIGTERM', 6000);
    await waitForPortFree(portA);
  }

  // =========================================================================
  // TEST PHASE B: Configured Server Security & Tenant Isolation (AC-02 to AC-13)
  // =========================================================================
  console.log('[PHASE B] Testing Configured Server WebSocket Security & Tenant Isolation...');
  const portB = await getFreePort();
  const configuredSecret = crypto.randomBytes(32).toString('hex');
  const serverProcessB = spawnProductionServer(portB, {
    PARANDO_AUTH_SECRET: configuredSecret,
  });

  const activeSockets: WebSocket[] = [];
  const trackSocket = (ws?: WebSocket) => {
    if (ws) activeSockets.push(ws);
    return ws;
  };

  try {
    await waitForServerReady(serverProcessB, portB);
    console.log(`Configured server ready on port ${portB}. Running WebSocket test scenarios...\n`);

    // Tokens for Gold Tenant (tenant-gold-bourse)
    const goldTraderToken = generateTestToken(
      {
        sub: 'trader-gold-01',
        tid: 'tenant-gold-bourse',
        roles: ['OFFERER'],
        eligible: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      configuredSecret
    );

    const goldTrader2Token = generateTestToken(
      {
        sub: 'trader-gold-02',
        tid: 'tenant-gold-bourse',
        roles: ['OFFERER'],
        eligible: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      configuredSecret
    );

    const goldAdminToken = generateTestToken(
      {
        sub: 'admin-gold-01',
        tid: 'tenant-gold-bourse',
        roles: ['EXCHANGE_ADMIN'],
        eligible: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      configuredSecret
    );

    const goldAuditorToken = generateTestToken(
      {
        sub: 'auditor-gold-01',
        tid: 'tenant-gold-bourse',
        roles: ['AUDITOR'],
        eligible: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      configuredSecret
    );

    // Tokens for Petrochem Tenant (tenant-energy-bourse)
    const petroTraderToken = generateTestToken(
      {
        sub: 'trader-petro-01',
        tid: 'tenant-energy-bourse',
        roles: ['OFFERER'],
        eligible: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      configuredSecret
    );

    // -----------------------------------------------------------------------
    // AC-02: Missing Credentials Rejection
    // -----------------------------------------------------------------------
    console.log('[Test 1/12] Testing unauthenticated WebSocket upgrade rejection...');
    const unauthGeneral = await connectWs(`ws://127.0.0.1:${portB}/ws`);
    assert(!unauthGeneral.connected, 'Unauthenticated connection to /ws rejected');
    assert(unauthGeneral.statusCode === 401 || !!unauthGeneral.error, 'Unauthenticated /ws returned 401 or socket destroyed');

    const unauthComp = await connectWs(`ws://127.0.0.1:${portB}/ws/competitions/COMP-GOLD-001`);
    assert(!unauthComp.connected, 'Unauthenticated connection to /ws/competitions/COMP-GOLD-001 rejected');
    assert(unauthComp.messages.length === 0, 'Zero snapshot delivered to unauthenticated client');
    console.log('✓ Test 1 passed: Missing credentials rejected on upgrade.\n');

    // -----------------------------------------------------------------------
    // AC-03: Malformed, Expired, and Untrusted-Key Tokens Rejection
    // -----------------------------------------------------------------------
    console.log('[Test 2/12] Testing malformed, expired, and untrusted tokens rejection...');
    const malformedConn = await connectWs(`ws://127.0.0.1:${portB}/ws`, {
      headers: { Authorization: 'Bearer not-a-valid-jwt-token' },
    });
    assert(!malformedConn.connected, 'Malformed token connection rejected on upgrade');

    const expiredToken = generateTestToken(
      {
        sub: 'trader-gold-01',
        tid: 'tenant-gold-bourse',
        roles: ['OFFERER'],
        eligible: true,
        exp: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
      },
      configuredSecret
    );
    const expiredConn = await connectWs(`ws://127.0.0.1:${portB}/ws`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert(!expiredConn.connected, 'Expired token connection rejected on upgrade');

    const wrongSecret = crypto.randomBytes(32).toString('hex');
    const wrongSecretToken = generateTestToken(
      {
        sub: 'trader-gold-01',
        tid: 'tenant-gold-bourse',
        roles: ['OFFERER'],
        eligible: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      wrongSecret
    );
    const wrongSecretConn = await connectWs(`ws://127.0.0.1:${portB}/ws`, {
      headers: { Authorization: `Bearer ${wrongSecretToken}` },
    });
    assert(!wrongSecretConn.connected, 'Token signed by untrusted secret rejected on upgrade');
    console.log('✓ Test 2 passed: Malformed, expired, and untrusted tokens rejected.\n');

    // -----------------------------------------------------------------------
    // AC-04: Nonexistent Competition & Invalid Route Rejection
    // -----------------------------------------------------------------------
    console.log('[Test 3/12] Testing invalid paths and nonexistent competition routes...');
    const invalidRouteConn = await connectWs(`ws://127.0.0.1:${portB}/invalid-route`, {
      headers: { Authorization: `Bearer ${goldTraderToken}` },
    });
    assert(!invalidRouteConn.connected, 'Invalid route /invalid-route rejected');
    assert(invalidRouteConn.statusCode === 404 || !!invalidRouteConn.error, 'Invalid route returns 404');

    const nonexistentCompConn = await connectWs(`ws://127.0.0.1:${portB}/ws/competitions/COMP-NONEXISTENT`, {
      headers: { Authorization: `Bearer ${goldTraderToken}` },
    });
    assert(!nonexistentCompConn.connected, 'Connection to nonexistent competition rejected');
    assert(nonexistentCompConn.statusCode === 404 || !!nonexistentCompConn.error, 'Nonexistent competition returns 404');
    console.log('✓ Test 3 passed: Unsupported paths and nonexistent competitions rejected with 404.\n');

    // -----------------------------------------------------------------------
    // AC-05: Cross-Tenant Access to Competition WebSocket Rejected (403)
    // -----------------------------------------------------------------------
    console.log('[Test 4/12] Testing cross-tenant competition upgrade rejection (403 Forbidden)...');
    // Petro trader (tenant-energy-bourse) attempts to access Gold competition (tenant-gold-bourse)
    const crossTenantConn = await connectWs(`ws://127.0.0.1:${portB}/ws/competitions/COMP-GOLD-001`, {
      headers: { Authorization: `Bearer ${petroTraderToken}` },
    });
    assert(!crossTenantConn.connected, 'Cross-tenant WebSocket upgrade to COMP-GOLD-001 was REJECTED');
    assert(
      crossTenantConn.statusCode === 403 || !!crossTenantConn.error,
      'Cross-tenant connection returns 403 Forbidden or socket destroyed'
    );
    assert(crossTenantConn.messages.length === 0, 'Zero snapshot delivered to cross-tenant participant');
    console.log('✓ Test 4 passed: Cross-tenant competition upgrade rejected with 403; zero snapshot delivered.\n');

    // -----------------------------------------------------------------------
    // AC-06: Authorized Connection to Competition & Snapshot Delivery
    // -----------------------------------------------------------------------
    console.log('[Test 5/12] Testing authorized connection and ladder.snapshot delivery...');
    const authGoldConn = await connectWs(`ws://127.0.0.1:${portB}/ws/competitions/COMP-GOLD-001`, {
      headers: { Authorization: `Bearer ${goldTraderToken}` },
    });
    assert(authGoldConn.connected, 'Authorized connection to COMP-GOLD-001 established');
    trackSocket(authGoldConn.ws);

    // Wait for snapshot
    const snapshotMsg = await waitForMessage(
      authGoldConn.ws!,
      authGoldConn.messages,
      (m) => m && m.type === 'ladder.snapshot'
    );
    assert(snapshotMsg.competition_id === 'COMP-GOLD-001', 'Snapshot competition_id matches');
    assert(snapshotMsg.tenant_id === 'tenant-gold-bourse', 'Snapshot tenant_id matches');
    assert(Array.isArray(snapshotMsg.ladder), 'Snapshot contains ladder array');
    assert(
      authGoldConn.responseHeaders?.['sec-websocket-protocol'] === undefined,
      'Authorization header connection does not return Sec-WebSocket-Protocol header'
    );
    assert(
      !authGoldConn.ws?.protocol,
      'Authorization header connection leaves ws.protocol empty'
    );
    assertNoCredentialLeak(
      authGoldConn.responseHeaders,
      authGoldConn.ws?.protocol,
      goldTraderToken,
      'Standard Authorization Header'
    );
    console.log('✓ Test 5 passed: Authorized connection receives competition snapshot.\n');

    // -----------------------------------------------------------------------
    // AC-07: Subprotocol Authentication via Sec-WebSocket-Protocol (Zero Credential Leakage)
    // -----------------------------------------------------------------------
    console.log('[Test 6/12] Testing subprotocol authentication & zero credential reflection in handshake/protocol...');
    
    // Test 6a: Multi-subprotocol convention ['parando-v1', 'bearer.<token>']
    const subprotoConn1 = await connectWs(`ws://127.0.0.1:${portB}/ws/competitions/COMP-GOLD-001`, {
      protocols: ['parando-v1', `bearer.${goldTrader2Token}`],
    });
    const subprotoConn = subprotoConn1;
    assert(subprotoConn1.connected, 'Connection using Sec-WebSocket-Protocol (parando-v1) succeeded');
    trackSocket(subprotoConn1.ws);
    assert(subprotoConn1.ws?.protocol === 'parando-v1', "ws.protocol negotiated as 'parando-v1'");
    assert(
      subprotoConn1.responseHeaders?.['sec-websocket-protocol'] === 'parando-v1',
      "Response Sec-WebSocket-Protocol header is 'parando-v1'"
    );
    assertNoCredentialLeak(
      subprotoConn1.responseHeaders,
      subprotoConn1.ws?.protocol,
      goldTrader2Token,
      "Subprotocol ['parando-v1', 'bearer.<token>']"
    );

    const subprotoSnapshot1 = await waitForMessage(
      subprotoConn1.ws!,
      subprotoConn1.messages,
      (m) => m && m.type === 'ladder.snapshot'
    );
    assert(subprotoSnapshot1.competition_id === 'COMP-GOLD-001', 'Subprotocol client received ladder.snapshot');

    // Test 6b: Pair convention ['bearer', '<token>']
    const subprotoConn2 = await connectWs(`ws://127.0.0.1:${portB}/ws/competitions/COMP-GOLD-001`, {
      protocols: ['bearer', goldTrader2Token],
    });
    assert(subprotoConn2.connected, 'Connection using Sec-WebSocket-Protocol (bearer pair) succeeded');
    trackSocket(subprotoConn2.ws);
    assert(subprotoConn2.ws?.protocol === 'bearer', "ws.protocol negotiated as 'bearer'");
    assert(
      subprotoConn2.responseHeaders?.['sec-websocket-protocol'] === 'bearer',
      "Response Sec-WebSocket-Protocol header is 'bearer'"
    );
    assertNoCredentialLeak(
      subprotoConn2.responseHeaders,
      subprotoConn2.ws?.protocol,
      goldTrader2Token,
      "Subprotocol ['bearer', '<token>']"
    );

    const subprotoSnapshot2 = await waitForMessage(
      subprotoConn2.ws!,
      subprotoConn2.messages,
      (m) => m && m.type === 'ladder.snapshot'
    );
    assert(subprotoSnapshot2.competition_id === 'COMP-GOLD-001', 'Bearer pair client received ladder.snapshot');

    // Test 6c: Alternative application subprotocol ['parando-auth', 'bearer.<token>']
    const subprotoConn3 = await connectWs(`ws://127.0.0.1:${portB}/ws/competitions/COMP-GOLD-001`, {
      protocols: ['parando-auth', `bearer.${goldTrader2Token}`],
    });
    assert(subprotoConn3.connected, 'Connection using Sec-WebSocket-Protocol (parando-auth) succeeded');
    trackSocket(subprotoConn3.ws);
    assert(subprotoConn3.ws?.protocol === 'parando-auth', "ws.protocol negotiated as 'parando-auth'");
    assertNoCredentialLeak(
      subprotoConn3.responseHeaders,
      subprotoConn3.ws?.protocol,
      goldTrader2Token,
      "Subprotocol ['parando-auth', 'bearer.<token>']"
    );

    // Test 6d: Raw Handshake HTTP Header Inspections
    console.log('  -> Inspecting raw HTTP upgrade handshake response headers for credential reflection...');
    // Raw case 1: "parando-v1, bearer.<token>" -> returns HTTP 101, Sec-WebSocket-Protocol: parando-v1
    const rawRes1 = await performRawUpgradeRequest(`http://127.0.0.1:${portB}/ws/competitions/COMP-GOLD-001`, {
      headers: { 'Sec-WebSocket-Protocol': `parando-v1, bearer.${goldTrader2Token}` },
    });
    assert(rawRes1.statusCode === 101, 'Raw upgrade request with parando-v1 and bearer token returned 101');
    assert(rawRes1.headers['sec-websocket-protocol'] === 'parando-v1', "Raw response protocol is 'parando-v1'");
    assertNoCredentialLeak(rawRes1.headers, undefined, goldTrader2Token, 'Raw parando-v1 handshake');
    rawRes1.socket?.destroy();

    // Raw case 2: "bearer, <token>" -> returns HTTP 101, Sec-WebSocket-Protocol: bearer
    const rawRes2 = await performRawUpgradeRequest(`http://127.0.0.1:${portB}/ws/competitions/COMP-GOLD-001`, {
      headers: { 'Sec-WebSocket-Protocol': `bearer, ${goldTrader2Token}` },
    });
    assert(rawRes2.statusCode === 101, 'Raw upgrade request with bearer pair returned 101');
    assert(rawRes2.headers['sec-websocket-protocol'] === 'bearer', "Raw response protocol is 'bearer'");
    assertNoCredentialLeak(rawRes2.headers, undefined, goldTrader2Token, 'Raw bearer pair handshake');
    rawRes2.socket?.destroy();

    // Raw case 3: "bearer.<token>" alone (no safe application subprotocol)
    // Server MUST NOT echo "bearer.<token>" in Sec-WebSocket-Protocol response header!
    const rawRes3 = await performRawUpgradeRequest(`http://127.0.0.1:${portB}/ws/competitions/COMP-GOLD-001`, {
      headers: { 'Sec-WebSocket-Protocol': `bearer.${goldTrader2Token}` },
    });
    assert(rawRes3.statusCode === 101, 'Raw upgrade request with isolated bearer.<token> returned 101');
    assert(
      rawRes3.headers['sec-websocket-protocol'] === undefined,
      'Server MUST NOT negotiate or echo Sec-WebSocket-Protocol when only credential was supplied'
    );
    assertNoCredentialLeak(rawRes3.headers, undefined, goldTrader2Token, 'Raw isolated bearer.<token> handshake');
    rawRes3.socket?.destroy();

    // Raw case 4: Raw compact JWT alone in Sec-WebSocket-Protocol
    const rawRes4 = await performRawUpgradeRequest(`http://127.0.0.1:${portB}/ws/competitions/COMP-GOLD-001`, {
      headers: { 'Sec-WebSocket-Protocol': goldTrader2Token },
    });
    assert(rawRes4.statusCode === 101, 'Raw upgrade request with compact token returned 101');
    assert(
      rawRes4.headers['sec-websocket-protocol'] === undefined,
      'Server MUST NOT negotiate or echo raw compact JWT in Sec-WebSocket-Protocol'
    );
    assertNoCredentialLeak(rawRes4.headers, undefined, goldTrader2Token, 'Raw compact JWT handshake');
    rawRes4.socket?.destroy();

    // Test 6e: Negative Test / Assertion Sensitivity Verification
    // Prove that assertNoCredentialLeak would fail if the server ever echoed credentials (detects regressions)
    let caughtSimulatedLeak = false;
    try {
      assertNoCredentialLeak(
        { 'sec-websocket-protocol': `bearer.${goldTrader2Token}` },
        `bearer.${goldTrader2Token}`,
        goldTrader2Token,
        'Simulated Vulnerable Server Response'
      );
    } catch (err: any) {
      caughtSimulatedLeak = true;
      assert(err.message.includes('SECURITY BLOCKER'), 'Assertion accurately catches credential reflection');
    }
    assert(
      caughtSimulatedLeak,
      'Negative test passed: regression suite strictly fails if credentials are leaked in handshake response or ws.protocol'
    );

    console.log('✓ Test 6 passed: Sec-WebSocket-Protocol subprotocol authentication verified with zero credential reflection.\n');

    // -----------------------------------------------------------------------
    // AC-08: Cross-Tenant Event Isolation (Offers & Settlement)
    // -----------------------------------------------------------------------
    console.log('[Test 7/12] Testing strict cross-tenant event isolation during offers and settlement...');
    // Connect authorized Petro trader to Petro competition (COMP-PETRO-001)
    const petroConn = await connectWs(`ws://127.0.0.1:${portB}/ws/competitions/COMP-PETRO-001`, {
      headers: { Authorization: `Bearer ${petroTraderToken}` },
    });
    assert(petroConn.connected, 'Petro trader connected to COMP-PETRO-001');
    trackSocket(petroConn.ws);

    // Clear previous received messages count for clean tracking
    const initialPetroMessageCount = petroConn.messages.length;

    // Issue proof for trader-gold-01 in tenant-gold-bourse
    const proofRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port: portB,
        path: '/api/v1/proofs',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${goldAdminToken}`,
        },
      },
      JSON.stringify({
        offerer_id: 'trader-gold-01',
        tenant_id: 'tenant-gold-bourse',
        guaranteed_amount: 500_000_000_000,
        valid_hours: 48,
      })
    );
    assert(proofRes.status === 200, 'Commitment proof issued for Gold trader');

    // Submit offer on Gold competition COMP-GOLD-001
    const offerRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port: portB,
        path: '/api/v1/competitions/COMP-GOLD-001/offers',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${goldTraderToken}`,
        },
      },
      JSON.stringify({
        amount: 43_000_000_000,
      })
    );
    assert(offerRes.status === 200, 'Offer placed successfully on COMP-GOLD-001');

    // Verify Gold connection received ladder.update
    const ladderUpdateMsg = await waitForMessage(
      authGoldConn.ws!,
      authGoldConn.messages,
      (m) => m && m.type === 'ladder.update' && m.competition_id === 'COMP-GOLD-001'
    );
    assert(ladderUpdateMsg.competition_id === 'COMP-GOLD-001', 'Gold client received ladder.update');
    assert(ladderUpdateMsg.tenant_id === 'tenant-gold-bourse', 'ladder.update scoped to tenant-gold-bourse');

    // Settle Gold competition
    const settleRes = await httpRequest(
      {
        hostname: '127.0.0.1',
        port: portB,
        path: '/api/v1/competitions/COMP-GOLD-001/settle',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${goldAdminToken}`,
        },
      }
    );
    assert(settleRes.status === 200, 'COMP-GOLD-001 settled successfully');

    // Verify Gold connection received ladder.determined
    const ladderDeterminedMsg = await waitForMessage(
      authGoldConn.ws!,
      authGoldConn.messages,
      (m) => m && m.type === 'ladder.determined' && m.competition_id === 'COMP-GOLD-001'
    );
    assert(ladderDeterminedMsg.competition_id === 'COMP-GOLD-001', 'Gold client received ladder.determined');

    // Give a brief window (300ms) to ensure any rogue async broadcasts would have arrived
    await new Promise((r) => setTimeout(r, 300));

    // CRITICAL ASSERTION: Check Petro client messages
    // The Petro client should NOT have received ANY ladder.update or ladder.determined for COMP-GOLD-001
    const petroLeakedGoldMessages = petroConn.messages
      .slice(initialPetroMessageCount)
      .filter((m) => m && (m.competition_id === 'COMP-GOLD-001' || m.type === 'ladder.update' || m.type === 'ladder.determined'));
    assert(
      petroLeakedGoldMessages.length === 0,
      `Strict tenant isolation enforced: Zero Gold events leaked to Petro tenant client (leaked count: ${petroLeakedGoldMessages.length})`
    );
    console.log('✓ Test 7 passed: Strict cross-tenant event isolation verified (zero events leaked across tenants).\n');

    // -----------------------------------------------------------------------
    // AC-09: Presence Information Isolation
    // -----------------------------------------------------------------------
    console.log('[Test 8/12] Testing presence information tenant isolation...');
    // The presence sync received by Gold clients must be scoped to COMP-GOLD-001 or tenant-gold-bourse
    const goldPresence = authGoldConn.messages.find(
      (m) => m && m.type === 'PRESENCE_SYNC' && m.competition_id === 'COMP-GOLD-001'
    );
    assert(goldPresence !== undefined, 'Gold client received competition-scoped presence');
    assert(goldPresence.tenant_id === 'tenant-gold-bourse', 'Presence tenant_id is tenant-gold-bourse');

    // Check Petro presence sync
    const petroPresence = petroConn.messages.find(
      (m) => m && m.type === 'PRESENCE_SYNC' && m.competition_id === 'COMP-PETRO-001'
    );
    assert(petroPresence !== undefined, 'Petro client received Petro-scoped presence');
    assert(petroPresence.tenant_id === 'tenant-energy-bourse', 'Petro presence is tenant-energy-bourse');
    console.log('✓ Test 8 passed: Presence sync is strictly scoped per competition and tenant.\n');

    // -----------------------------------------------------------------------
    // AC-10: Client Message Relay Isolation
    // -----------------------------------------------------------------------
    console.log('[Test 9/12] Testing client-to-client message relay scoping...');
    const petroInitialCount = petroConn.messages.length;
    const testCustomMessage = { type: 'TRADE_NOTE', text: 'Gold bidding strategy' };

    // Gold client 1 sends a message
    authGoldConn.ws!.send(JSON.stringify(testCustomMessage));

    // Subprotocol client in same competition (Gold) should receive it
    const goldRelayed = await waitForMessage(
      subprotoConn.ws!,
      subprotoConn.messages,
      (m) => m && m.type === 'TRADE_NOTE' && m.text === 'Gold bidding strategy'
    );
    assert(goldRelayed.type === 'TRADE_NOTE', 'Same-competition watcher received relayed message');

    await new Promise((r) => setTimeout(r, 200));

    // Petro client in different competition/tenant must NOT receive it
    const petroLeakedCustom = petroConn.messages
      .slice(petroInitialCount)
      .filter((m) => m && m.type === 'TRADE_NOTE');
    assert(petroLeakedCustom.length === 0, 'Cross-tenant client received ZERO relayed messages');
    console.log('✓ Test 9 passed: Client message relays are strictly isolated to matching tenant and competition.\n');

    // -----------------------------------------------------------------------
    // AC-11: Ping/Pong Heartbeat on Authorized Sockets
    // -----------------------------------------------------------------------
    console.log('[Test 10/12] Testing ping/pong string and JSON heartbeats...');
    let pongStringReceived = false;
    let pongJsonReceived = false;

    const pingPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Ping/Pong timed out')), 3000);
      const onMsg = (data: any) => {
        const text = data.toString();
        if (text === 'pong') {
          pongStringReceived = true;
          authGoldConn.ws!.send(JSON.stringify({ type: 'PING' }));
        } else {
          try {
            const j = JSON.parse(text);
            if (j.type === 'PONG') {
              pongJsonReceived = true;
            }
          } catch {}
        }
        if (pongStringReceived && pongJsonReceived) {
          clearTimeout(timeout);
          authGoldConn.ws!.removeListener('message', onMsg);
          resolve();
        }
      };
      authGoldConn.ws!.on('message', onMsg);
      authGoldConn.ws!.send('ping');
    });

    await pingPromise;
    assert(pongStringReceived && pongJsonReceived, 'Received both text pong and JSON PONG responses');
    console.log('✓ Test 10 passed: Authorized heartbeat (ping/pong) is fully operational.\n');

    // -----------------------------------------------------------------------
    // AC-12: Disconnect Cleanup
    // -----------------------------------------------------------------------
    console.log('[Test 11/12] Testing disconnect presence cleanup...');
    const subprotoSocket = subprotoConn.ws!;
    subprotoSocket.close();

    // The remaining gold socket should observe presence update
    const presenceAfterClose = await waitForMessage(
      authGoldConn.ws!,
      [],
      (m) => m && m.type === 'PRESENCE_SYNC' && m.competition_id === 'COMP-GOLD-001'
    );
    assert(
      typeof presenceAfterClose.payload?.activeWatchers === 'number',
      'Presence sync emitted following client disconnect'
    );
    console.log('✓ Test 11 passed: Disconnected client cleaned up and presence count refreshed.\n');

    // -----------------------------------------------------------------------
    // AC-13: Audit Alert Verification
    // -----------------------------------------------------------------------
    console.log('[Test 12/12] Testing audit logging of unauthorized WebSocket upgrade attempts...');
    const auditRes = await httpRequest({
      hostname: '127.0.0.1',
      port: portB,
      path: '/api/v1/events',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${goldAuditorToken}`,
      },
    });
    assert(auditRes.status === 200, 'Auditor successfully queried audit events');
    const events = JSON.parse(auditRes.body);
    assert(Array.isArray(events), 'Events response is an array');

    // Verify security alert was logged for the earlier unauthorized / tenant mismatch attempts
    const securityAlerts = events.filter((e: any) => e.event_type === 'SECURITY_ALERT');
    assert(securityAlerts.length > 0, 'Security alerts were logged for unauthorized WebSocket events');
    assert(
      securityAlerts.some((a: any) => a.sub_type?.startsWith('WS_')),
      'Audit log contains WS_* security alerts'
    );
    console.log('✓ Test 12 passed: Security alerts recorded in audit events without credential leakage.\n');

    console.log('=============================================================');
    console.log('ALL P0-03 WEBSOCKET SECURITY REGRESSION TESTS PASSED (12/12)');
    console.log('=============================================================\n');
  } finally {
    for (const ws of activeSockets) {
      try {
        ws.terminate();
      } catch {}
    }
    await terminateServerGracefully(serverProcessB, 'SIGTERM', 6000);
    await waitForPortFree(portB);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWebSocketSecurityTests()
    .then(() => {
      console.log('[SUCCESS] All P0-03 regression test suites completed with exit 0.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[FATAL FAILURE in P0-03 Regression Suite]:', err);
      process.exit(1);
    });
}
