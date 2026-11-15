import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHANNEL_CALLBACK_API_VERSION,
  CHANNEL_PROVIDER_ID,
  WeixinInstalledChannelProvider,
  createInstalledWeixinChannelProvider,
  createWeixinChannelProvider,
  type ChannelTurnCallback,
  type ChannelTurnObserver,
  type FetchLike,
  type WeixinDiagnostic,
} from '../src/index.js';

const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

test('inbound identity is forwarded exactly and completed output is sent once', async () => {
  const sendBodies: unknown[] = [];
  let pollCount = 0;
  const fetcher: FetchLike = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/ilink/bot/getupdates')) {
      pollCount += 1;
      if (pollCount === 1) {
        return jsonResponse({
          ret: 0,
          msgs: [{
            from_user_id: 'session-exact',
            context_token: 'context-exact',
            item_list: [
              { type: 1, text_item: { text: 'message exact' } },
              { type: 3, voice_item: { text: 'voice transcript' } },
            ],
          }],
          get_updates_buf: 'cursor-exact',
        });
      }
      return abortingResponse(init.signal);
    }
    sendBodies.push(JSON.parse(String(init.body)));
    return jsonResponse({ ret: 0 });
  };

  const startInputs: unknown[] = [];
  const resumeInputs: unknown[] = [];
  const turnInputs: unknown[] = [];
  let observer: ChannelTurnObserver | undefined;
  let disposeCount = 0;
  const callback: ChannelTurnCallback = {
    startThread: async (input) => {
      startInputs.push(input);
      return { canonical_thread_host: 'host-exact', canonical_thread_id: 'thread-exact' };
    },
    resumeThread: async (input) => { resumeInputs.push(input); },
    startTurn: async (input) => {
      turnInputs.push(input);
      return { ...input, canonical_turn_id: 'turn-exact' };
    },
    subscribeTurn: (_turn, candidate) => {
      observer = candidate;
      return { dispose: () => { disposeCount += 1; } };
    },
  };
  const provider = createWeixinChannelProvider(
    { credentials: { account_id: 'account-exact', bot_token: 'token-exact' } },
    { fetch: fetcher },
  );

  const lifecycle = await provider.start({
    callback_api_version: CHANNEL_CALLBACK_API_VERSION,
    callback,
  });
  await waitFor(() => observer !== undefined);
  await observer?.onTerminal({
    canonical_thread_host: 'host-exact',
    canonical_thread_id: 'thread-exact',
    canonical_turn_id: 'turn-exact',
    status: 'completed',
    response_text: 'reply exact',
  });
  await waitFor(() => sendBodies.length === 1);

  assert.deepEqual(startInputs, [{
    provider_id: CHANNEL_PROVIDER_ID,
    account_id: 'account-exact',
    channel_session_id: 'session-exact',
  }]);
  assert.deepEqual(resumeInputs, [{
    canonical_thread_host: 'host-exact',
    canonical_thread_id: 'thread-exact',
  }]);
  assert.deepEqual(turnInputs, [{
    canonical_thread_host: 'host-exact',
    canonical_thread_id: 'thread-exact',
    text: 'message exact\nvoice transcript',
  }]);
  assert.equal((sendBodies[0] as { msg: { to_user_id: string } }).msg.to_user_id, 'session-exact');
  assert.equal((sendBodies[0] as { msg: { context_token: string } }).msg.context_token, 'context-exact');
  assert.equal(disposeCount, 1);
  await lifecycle.dispose();
  assert.equal(provider.status, 'stopped');
});

test('failed, cancelled, and mismatched terminals never send a success reply', async () => {
  const diagnostics: WeixinDiagnostic[] = [];
  const observers: ChannelTurnObserver[] = [];
  const disposed: string[] = [];
  let sendCount = 0;
  let pollCount = 0;
  const fetcher: FetchLike = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/ilink/bot/sendmessage')) {
      sendCount += 1;
      return jsonResponse({ ret: 0 });
    }
    pollCount += 1;
    if (pollCount === 1) {
      return jsonResponse({
        ret: 0,
        msgs: ['failed-session', 'cancelled-session', 'mismatch-session'].map((from_user_id) => ({
          from_user_id,
          item_list: [{ type: 1, text_item: { text: `message-${from_user_id}` } }],
        })),
        get_updates_buf: 'cursor-2',
      });
    }
    return abortingResponse(init.signal);
  };
  const callback: ChannelTurnCallback = {
    startThread: async ({ channel_session_id }) => ({
      canonical_thread_host: 'host-1',
      canonical_thread_id: `thread-${channel_session_id}`,
    }),
    resumeThread: async () => {},
    startTurn: async (thread) => ({ ...thread, canonical_turn_id: `turn-${thread.canonical_thread_id}` }),
    subscribeTurn: (turn, observer) => {
      observers.push(observer);
      return { dispose: () => { disposed.push(turn.canonical_turn_id); } };
    },
  };
  const provider = createWeixinChannelProvider(
    {
      credentials: { account_id: 'account-1', bot_token: 'token-1' },
      onDiagnostic: (event) => diagnostics.push(event),
    },
    { fetch: fetcher },
  );

  await provider.start({ callback_api_version: CHANNEL_CALLBACK_API_VERSION, callback });
  await waitFor(() => observers.length === 3);
  await observers[0]?.onTerminal({
    canonical_thread_host: 'host-1',
    canonical_thread_id: 'thread-failed-session',
    canonical_turn_id: 'turn-thread-failed-session',
    status: 'failed',
    error: { code: 'model_error', message: 'failed' },
  });
  await observers[1]?.onTerminal({
    canonical_thread_host: 'host-1',
    canonical_thread_id: 'thread-cancelled-session',
    canonical_turn_id: 'turn-thread-cancelled-session',
    status: 'cancelled',
  });
  await observers[2]?.onTerminal({
    canonical_thread_host: 'other-host',
    canonical_thread_id: 'thread-mismatch-session',
    canonical_turn_id: 'turn-thread-mismatch-session',
    status: 'completed',
    response_text: 'must not send',
  });

  assert.equal(sendCount, 0);
  assert.deepEqual(diagnostics.map((event) => event.code), [
    'turn_failed',
    'turn_cancelled',
    'turn_identity_mismatch',
  ]);
  assert.equal(disposed.length, 3);
  await provider.stop();
});

test('poll failures use bounded exponential backoff and stop aborts long poll', async () => {
  const delays: number[] = [];
  const diagnostics: WeixinDiagnostic[] = [];
  let pollCount = 0;
  const fetcher: FetchLike = async (_input, init = {}) => {
    pollCount += 1;
    if (pollCount <= 2) throw new Error('network unavailable');
    return abortingResponse(init.signal);
  };
  const callback = inertCallback();
  const provider = createWeixinChannelProvider(
    {
      credentials: { account_id: 'account-1', bot_token: 'token-1' },
      poll: { backoff_base_ms: 5, max_backoff_ms: 10 },
      onDiagnostic: (event) => diagnostics.push(event),
    },
    {
      fetch: fetcher,
      sleep: async (delay) => { delays.push(delay); },
    },
  );

  await provider.start({ callback_api_version: CHANNEL_CALLBACK_API_VERSION, callback });
  await waitFor(() => pollCount === 3);
  assert.deepEqual(delays, [5, 10]);
  assert.deepEqual(diagnostics.map((event) => event.code), ['poll_failed', 'poll_failed']);
  await provider.dispose();
  assert.equal(provider.status, 'stopped');
});

test('stop disposes a non-terminal subscription', async () => {
  let disposeCount = 0;
  let subscribed = false;
  let pollCount = 0;
  const fetcher: FetchLike = async (_input, init = {}) => {
    pollCount += 1;
    if (pollCount === 1) {
      return jsonResponse({
        ret: 0,
        msgs: [{ from_user_id: 'session-1', item_list: [{ type: 1, text_item: { text: 'hello' } }] }],
      });
    }
    return abortingResponse(init.signal);
  };
  const callback: ChannelTurnCallback = {
    ...inertCallback(),
    subscribeTurn: () => {
      subscribed = true;
      return { dispose: () => { disposeCount += 1; } };
    },
  };
  const provider = createWeixinChannelProvider(
    { credentials: { account_id: 'account-1', bot_token: 'token-1' } },
    { fetch: fetcher },
  );

  await provider.start({ callback_api_version: CHANNEL_CALLBACK_API_VERSION, callback });
  await waitFor(() => subscribed);
  await provider.stop();
  assert.equal(disposeCount, 1);
});

test('start rejects callback ABI drift and unrestricted methods', async () => {
  const provider = createWeixinChannelProvider(
    { credentials: { account_id: 'account-1', bot_token: 'token-1' } },
    { fetch: async () => jsonResponse({ ret: 0 }) },
  );
  await assert.rejects(
    provider.start({ callback_api_version: '2.0.0' as '1.0.0', callback: inertCallback() }),
    /Unsupported channel callback API version/,
  );
  const callbackWithRpc = { ...inertCallback(), request: () => Promise.resolve({}) };
  await assert.rejects(
    provider.start({
      callback_api_version: CHANNEL_CALLBACK_API_VERSION,
      callback: callbackWithRpc as ChannelTurnCallback,
    }),
    /Unsupported channel callback: request/,
  );
  await provider.stop();
});

test('installed provider factory returns a fresh provider for each host attachment', () => {
  const first = createInstalledWeixinChannelProvider();
  const second = createInstalledWeixinChannelProvider();

  assert.ok(first instanceof WeixinInstalledChannelProvider);
  assert.ok(second instanceof WeixinInstalledChannelProvider);
  assert.notEqual(first, second);
});

test('installed provider attaches dormant, then owns an explicit in-memory QR session', async () => {
  let pollStarted = false;
  let pollAborted = false;
  let presentedTicket = '';
  const fetcher: FetchLike = async (input, init = {}) => {
    const url = String(input);
    if (url.includes('get_bot_qrcode')) {
      return jsonResponse({
        data: { qrcode: 'ticket-installed', qrcode_img_content: 'weixin://installed' },
      });
    }
    if (url.includes('get_qrcode_status')) {
      return jsonResponse({
        status: 'confirmed',
        bot_token: 'token-installed',
        ilink_bot_id: 'account-installed',
        baseurl: 'https://ilink-installed.test',
      });
    }
    if (url.endsWith('/ilink/bot/getupdates')) {
      pollStarted = true;
      try {
        return await abortingResponse(init.signal);
      } finally {
        pollAborted = true;
      }
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const provider = createInstalledWeixinChannelProvider();
  assert.equal(provider.provider_id, CHANNEL_PROVIDER_ID);
  const lifecycle = await provider.start({
    callback_api_version: CHANNEL_CALLBACK_API_VERSION,
    callback: inertCallback(),
  });
  assert.equal(pollStarted, false);

  const session = await provider.loginWithQr({
    qr: {
      base_url: 'https://ilink.test',
      fetch: fetcher,
      onQrCode: (qr) => { presentedTicket = qr.ticket; },
    },
    dependencies: { fetch: fetcher },
  });

  await waitFor(() => pollStarted);
  assert.equal(presentedTicket, 'ticket-installed');
  assert.deepEqual(session, {
    account_id: 'account-installed',
    base_url: 'https://ilink-installed.test',
  });
  assert.equal(Object.hasOwn(session, 'bot_token'), false);
  assert.deepEqual(provider.session, session);

  await provider.logout();
  assert.equal(pollAborted, true);
  assert.equal(provider.session, null);
  assert.equal(provider.status, 'running');
  await lifecycle.dispose();
  assert.equal(provider.status, 'stopped');
});

test('installed provider projects QR connect and disconnect through its bounded contribution controller', async () => {
  let confirmLogin: (() => void) | undefined;
  let pollStarted = false;
  const confirmation = new Promise<void>((resolve) => { confirmLogin = resolve; });
  const fetcher: FetchLike = async (input, init = {}) => {
    const url = String(input);
    if (url.includes('get_bot_qrcode')) {
      return jsonResponse({
        data: { qrcode: 'ticket-controller', qrcode_img_content: 'weixin://controller' },
      });
    }
    if (url.includes('get_qrcode_status')) {
      await confirmation;
      return jsonResponse({
        status: 'confirmed',
        bot_token: 'token-controller',
        ilink_bot_id: 'account-controller',
        baseurl: 'https://ilink-controller.test',
      });
    }
    if (url.endsWith('/ilink/bot/getupdates')) {
      pollStarted = true;
      return abortingResponse(init.signal);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const provider = new WeixinInstalledChannelProvider({
    qr: { base_url: 'https://ilink.test', fetch: fetcher },
    dependencies: { fetch: fetcher },
  });
  const lifecycle = await provider.start({
    callback_api_version: CHANNEL_CALLBACK_API_VERSION,
    callback: inertCallback(),
  });
  const controller = provider.channel_access;
  await controller.execute({
    action_ref: 'weixin.channel-access#connect',
    input: { channel_id: 'weixin' },
  });
  await waitFor(async () => {
    const result = await controller.read({}) as any;
    return result.connection.state === 'qr_ready';
  });
  const qrReady = await controller.read({}) as any;
  assert.equal(qrReady.connection.qr_challenge.payload, 'weixin://controller');
  assert.equal(qrReady.actions[0].command_id, 'weixin-disconnect');

  confirmLogin?.();
  await waitFor(() => pollStarted && provider.session?.account_id === 'account-controller');
  const connected = await controller.read({}) as any;
  assert.equal(connected.connection.state, 'connected');
  assert.equal(connected.connection.account_display_name, 'account-controller');

  await controller.execute({
    action_ref: 'weixin.channel-access#disconnect',
    input: { channel_id: 'weixin' },
  });
  const disconnected = await controller.read({}) as any;
  assert.equal(disconnected.connection.state, 'disconnected');
  assert.equal(disconnected.actions[0].command_id, 'weixin-connect');
  await lifecycle.dispose();
});

test('installed provider expires projected QR challenges without persisting them', async () => {
  const fetcher: FetchLike = async (input, init = {}) => {
    const url = String(input);
    if (url.includes('get_bot_qrcode')) {
      return jsonResponse({ qrcode: 'ticket-expiry', qrcode_img_content: 'weixin://expiry' });
    }
    if (url.includes('get_qrcode_status')) return abortingResponse(init.signal);
    throw new Error(`Unexpected URL: ${url}`);
  };
  const provider = new WeixinInstalledChannelProvider({
    qr: { base_url: 'https://ilink.test', fetch: fetcher, timeout_ms: 20 },
  });
  const lifecycle = await provider.start({
    callback_api_version: CHANNEL_CALLBACK_API_VERSION,
    callback: inertCallback(),
  });
  await provider.channel_access.execute({
    action_ref: 'weixin.channel-access#connect',
    input: { channel_id: 'weixin' },
  });
  await waitFor(async () => {
    const result = await provider.channel_access.read({}) as any;
    return result.connection.state === 'qr_ready';
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const expired = await provider.channel_access.read({}) as any;
  assert.equal(expired.connection.state, 'attention');
  assert.equal(expired.connection.reason_code, 'timeout');
  assert.equal(Object.hasOwn(expired.connection, 'qr_challenge'), false);
  await provider.channel_access.execute({
    action_ref: 'weixin.channel-access#disconnect',
    input: { channel_id: 'weixin' },
  });
  await lifecycle.dispose();
});

test('installed provider is reattachable and rejects login before host attachment', async () => {
  const provider = createInstalledWeixinChannelProvider();
  await assert.rejects(provider.loginWithQr(), /must be attached/);
  const first = await provider.start({
    callback_api_version: CHANNEL_CALLBACK_API_VERSION,
    callback: inertCallback(),
  });
  await first.dispose();
  const second = await provider.start({
    callback_api_version: CHANNEL_CALLBACK_API_VERSION,
    callback: inertCallback(),
  });
  assert.equal(provider.status, 'running');
  await second.dispose();
  assert.equal(provider.status, 'stopped');
});

function inertCallback(): ChannelTurnCallback {
  return {
    startThread: async () => ({ canonical_thread_host: 'host-1', canonical_thread_id: 'thread-1' }),
    resumeThread: async () => {},
    startTurn: async (thread) => ({ ...thread, canonical_turn_id: 'turn-1' }),
    subscribeTurn: () => ({ dispose: () => {} }),
  };
}

function abortingResponse(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const rejectAbort = () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal?.aborted) {
      rejectAbort();
      return;
    }
    signal?.addEventListener('abort', rejectAbort, { once: true });
  });
}

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for test condition.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('installed PIN actions reject stale challenges and never project submitted PINs', async () => {
  let polls = 0;
  let sentCode: string | null = null;
  const provider = new WeixinInstalledChannelProvider({ qr: { sleep: async () => {}, fetch: async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('get_bot_qrcode')) return jsonResponse({ qrcode: 'controller-pin' });
    if (url.pathname.endsWith('getupdates')) return abortingResponse(init.signal);
    if (++polls === 1) return jsonResponse({ status: 'need_verifycode' });
    sentCode = url.searchParams.get('verify_code');
    return jsonResponse({ status: 'confirmed', bot_token: 'pin-token', ilink_bot_id: 'pin-account' });
  } } });
  const lifecycle = await provider.start({ callback_api_version: CHANNEL_CALLBACK_API_VERSION, callback: inertCallback() });
  try {
    await provider.channel_access.execute({ action_ref: 'weixin.channel-access#connect', input: { channel_id: 'weixin' } });
    await waitFor(async () => (await provider.channel_access.read({}) as any).connection.state === 'pin_required');
    const state = await provider.channel_access.read({}) as any;
    const input = { channel_id: 'weixin', challenge_id: state.connection.verification_challenge.challenge_id, verify_code: '012345' };
    await assert.rejects(provider.channel_access.execute({ action_ref: 'weixin.channel-access#submit-pin', input: { ...input, challenge_id: 'stale' } }), /Invalid or expired/);
    const submitted = await provider.channel_access.execute({ action_ref: 'weixin.channel-access#submit-pin', input });
    assert.equal(JSON.stringify(submitted).includes('012345'), false);
    await waitFor(() => provider.session?.account_id === 'pin-account');
    assert.equal(sentCode, '012345');
    await assert.rejects(provider.channel_access.execute({ action_ref: 'weixin.channel-access#submit-pin', input }), /Invalid or expired/);
  } finally { await lifecycle.dispose(); }
});

test('binding owner identity blocks other senders before invoking Codex', async () => {
  let polls = 0;
  const started: string[] = [];
  const callback = inertCallback();
  callback.startThread = async input => { started.push(input.channel_session_id); return { canonical_thread_host: 'host-1', canonical_thread_id: 'thread-1' }; };
  const provider = createWeixinChannelProvider({ credentials: { account_id: 'account', bot_token: 'token', user_id: 'owner' } }, {
    fetch: async (_input, init = {}) => ++polls === 1
      ? jsonResponse({ ret: 0, msgs: ['other', 'owner'].map(from_user_id => ({ from_user_id, item_list: [{ type: 1, text_item: { text: 'hello' } }] })), get_updates_buf: 'owner-cursor' })
      : abortingResponse(init.signal),
  });
  const lifecycle = await provider.start({ callback_api_version: CHANNEL_CALLBACK_API_VERSION, callback });
  try { await waitFor(() => polls >= 2); assert.deepEqual(started, ['owner']); }
  finally { await lifecycle.dispose(); }
});
