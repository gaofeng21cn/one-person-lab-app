import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IlinkApi,
  IlinkError,
  boundedExponentialBackoffMs,
  loginWithWeixinQr,
  type FetchLike,
} from '../src/index.js';

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('iLink getupdates and sendmessage preserve the required wire shape', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher: FetchLike = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith('/ilink/bot/getupdates')) {
      return jsonResponse({
        ret: 0,
        errcode: 0,
        msgs: [{
          from_user_id: 'weixin-user-1',
          context_token: 'context-1',
          item_list: [{ type: 1, text_item: { text: 'hello' } }],
        }],
        get_updates_buf: 'cursor-2',
      });
    }
    return jsonResponse({ ret: 0, errcode: 0 });
  };
  const api = new IlinkApi({ botToken: 'token-1', baseUrl: 'https://ilink.test', fetch: fetcher });

  const updates = await api.getUpdates('cursor-1');
  await api.sendText({
    to_user_id: 'weixin-user-1',
    text: 'reply',
    context_token: 'context-1',
  });

  assert.equal(updates.cursor, 'cursor-2');
  assert.equal(updates.messages[0]?.from_user_id, 'weixin-user-1');
  assert.equal(calls.length, 2);
  const pollHeaders = new Headers(calls[0]?.init.headers);
  assert.equal(pollHeaders.get('AuthorizationType'), 'ilink_bot_token');
  assert.equal(pollHeaders.get('Authorization'), 'Bearer token-1');
  assert.match(Buffer.from(pollHeaders.get('X-WECHAT-UIN') ?? '', 'base64').toString('utf8'), /^[0-9]{1,10}$/);
  assert.equal(pollHeaders.get('iLink-App-Id'), 'bot');
  assert.equal(pollHeaders.get('iLink-App-ClientVersion'), '512');
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
    get_updates_buf: 'cursor-1',
    base_info: { channel_version: '0.2.0', bot_agent: 'OPL' },
  });
  const sendBody = JSON.parse(String(calls[1]?.init.body));
  assert.equal(sendBody.msg.to_user_id, 'weixin-user-1');
  assert.equal(sendBody.msg.message_type, 2);
  assert.equal(sendBody.msg.message_state, 2);
  assert.equal(sendBody.msg.context_token, 'context-1');
  assert.deepEqual(sendBody.msg.item_list, [{ type: 1, text_item: { text: 'reply' } }]);
  assert.match(sendBody.msg.client_id, /^[0-9a-f-]{36}$/);
});

test('QR login returns explicit credentials without persistence', async () => {
  const urls: string[] = [];
  const fetcher: FetchLike = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('get_bot_qrcode')) {
      return jsonResponse({ data: { qrcode: 'ticket-1', qrcode_img_content: 'weixin://qr/1' } });
    }
    return jsonResponse({
      status: 'confirmed',
      bot_token: 'token-confirmed',
      ilink_bot_id: 'account-confirmed',
      baseurl: 'https://ilink-confirmed.test',
    });
  };
  let presentedQr = '';

  const result = await loginWithWeixinQr({
    base_url: 'https://ilink.test',
    fetch: fetcher,
    onQrCode: (qr) => { presentedQr = qr.ticket; },
  });

  assert.equal(presentedQr, 'ticket-1');
  assert.deepEqual(result, {
    account_id: 'account-confirmed',
    bot_token: 'token-confirmed',
    base_url: 'https://ilink-confirmed.test',
  });
  assert.equal(urls.length, 2);
  assert.match(urls[0] ?? '', /bot_type=3/);
  assert.match(urls[1] ?? '', /qrcode=ticket-1/);
});

for (const [status, code] of [['expired', 'qr_expired'], ['failed', 'qr_failed']] as const) {
  test(`QR login reports ${status} without fabricating credentials`, async () => {
    const fetcher: FetchLike = async (input) => String(input).includes('get_bot_qrcode')
      ? jsonResponse({ qrcode: 'ticket-expiring' })
      : jsonResponse({ status });

    await assert.rejects(
      loginWithWeixinQr({ base_url: 'https://ilink.test', fetch: fetcher }),
      (error: unknown) => error instanceof IlinkError && error.code === code,
    );
  });
}

test('poll backoff is exponential and bounded', () => {
  assert.equal(boundedExponentialBackoffMs(1, 1_000, 10_000), 1_000);
  assert.equal(boundedExponentialBackoffMs(2, 1_000, 10_000), 2_000);
  assert.equal(boundedExponentialBackoffMs(5, 1_000, 10_000), 10_000);
  assert.equal(boundedExponentialBackoffMs(500, 1_000, 10_000), 10_000);
});

test('official 3.0 QR POST supports phone PIN retries and scaned status', async () => {
  const codes: Array<string | null> = [];
  const requests: boolean[] = [];
  let poll = 0;
  const fetcher: FetchLike = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('get_bot_qrcode')) {
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(String(init.body)), { local_token_list: [], bot_spam_business_data: Buffer.from('{"verify_pin":1}').toString('base64') });
      return jsonResponse({ qrcode: 'pin-ticket' });
    }
    codes.push(url.searchParams.get('verify_code'));
    const status = ['scaned_need_verifycode', 'need_verifycode', 'scaned', 'confirmed'][poll++];
    return jsonResponse({ status, bot_token: 'token', ilink_bot_id: 'account', ilink_user_id: 'owner' });
  };
  const result = await loginWithWeixinQr({ fetch: fetcher, verify_pin: true, sleep: async () => {}, requestVerifyCode: async request => { requests.push(request.retry); return request.retry ? '123456' : '012345'; } });
  assert.deepEqual(requests, [false, true]);
  assert.deepEqual(codes, [null, '012345', '123456', null]);
  assert.equal(result.user_id, 'owner');
});

test('other-owner binding waits for real-name authorization before requesting a bot QR', async () => {
  const steps: string[] = [];
  const ticket = 'a'.repeat(32);
  const result = await loginWithWeixinQr({ bind_owner: 'other', sleep: async () => {},
    onAuthorizationQr: challenge => { steps.push('present-authorization'); assert.ok(challenge.expires_at_ms > Date.now()); },
    fetch: async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.searchParams.get('step') === 'get_auth_url') {
        assert.equal(url.searchParams.get('plugin_version'), '0.2.0');
        steps.push('ticket');
        return jsonResponse({ data: { bot_spam_ticket: ticket, auth_url: 'https://weixin110.qq.com/auth?ticket=example', expire_time: Math.floor(Date.now() / 1000) + 60 } });
      }
      if (url.searchParams.get('step') === 'query_auth_result') { steps.push('authorized'); return jsonResponse({ auth_status: 1 }); }
      if (url.pathname.endsWith('get_bot_qrcode')) {
        steps.push('bot-qr'); assert.equal(JSON.parse(String(init.body)).bot_spam_ticket, ticket);
        return jsonResponse({ qrcode: 'other-qr' });
      }
      return jsonResponse({ status: 'confirmed', ilink_bot_id: 'other-account', bot_token: 'other-token' });
    },
  });
  assert.deepEqual(steps, ['ticket', 'present-authorization', 'authorized', 'bot-qr']);
  assert.equal(result.account_id, 'other-account');
});

test('QR login follows official IDC redirects and rejects foreign hosts before sending credentials', async () => {
  for (const host of ['ilinkai.hk.weixin.qq.com', 'attacker.test']) {
    const hosts: string[] = [];
    let poll = 0;
    const task = loginWithWeixinQr({ sleep: async () => {}, fetch: async input => {
      const url = new URL(String(input)); hosts.push(url.hostname);
      if (url.pathname.endsWith('get_bot_qrcode')) return jsonResponse({ qrcode: 'redirect-qr' });
      return ++poll === 1 ? jsonResponse({ status: 'scaned_but_redirect', redirect_host: host })
        : jsonResponse({ status: 'confirmed', bot_token: 'redirect-token', ilink_bot_id: 'redirect-account' });
    } });
    if (host === 'attacker.test') { await assert.rejects(task, /redirect host is invalid/); assert.equal(hosts.includes(host), false); }
    else { await task; assert.equal(hosts.at(-1), host); }
  }
});

test('cancelling while waiting for a phone PIN settles without a PIN submission', async () => {
  const abort = new AbortController();
  const task = loginWithWeixinQr({ signal: abort.signal, fetch: async input => jsonResponse(String(input).includes('get_bot_qrcode') ? { qrcode: 'cancel-pin' } : { status: 'need_verifycode' }),
    requestVerifyCode: () => { queueMicrotask(() => abort.abort()); return new Promise(() => {}); },
  });
  await assert.rejects(task, (error: unknown) => error instanceof IlinkError && error.code === 'aborted');
});

test('blocked PINs and rejected real-name authorization stop the current login', async () => {
  for (const [bind_owner, status, expected] of [['self', 'verify_code_blocked', 'verify_code_blocked'], ['self', 'binded_redirect', 'already_bound'], ['other', 2, 'auth_rejected']] as const) {
    let botRequests = 0;
    const task = loginWithWeixinQr({ bind_owner, fetch: async input => {
      const url = new URL(String(input));
      if (url.searchParams.get('step') === 'get_auth_url') return jsonResponse({ bot_spam_ticket: 'b'.repeat(32), auth_url: 'https://weixin110.qq.com/auth?ticket=example', expire_time: Math.floor(Date.now() / 1000) + 60 });
      if (url.searchParams.get('step') === 'query_auth_result') return jsonResponse({ auth_status: status });
      if (url.pathname.endsWith('get_bot_qrcode')) { botRequests++; return jsonResponse({ qrcode: 'blocked-qr' }); }
      return jsonResponse({ status });
    } });
    await assert.rejects(task, (error: unknown) => error instanceof IlinkError && error.code === expected);
    if (bind_owner === 'other') assert.equal(botRequests, 0);
  }
});
