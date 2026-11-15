/**
 * iLink protocol semantics independently adapted from AionCore v0.1.57.
 * See NOTICE for the exact Apache-2.0 source identity and excluded surfaces.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { abortableSleep } from './backoff.js';
import type { FetchLike, Sleep } from './types.js';

export const DEFAULT_ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
export const WEIXIN_PROTOCOL_VERSION = '3.0.0-beta-0';
export const WEIXIN_CHANNEL_VERSION = '0.2.0';
const BASE_INFO = { channel_version: WEIXIN_CHANNEL_VERSION, bot_agent: 'OPL' };
const REALNAME_AUTH_URL = 'https://weixin110.qq.com/security/acct/botrealnameverifycgi';

export type WeixinQrCode = {
  ticket: string;
  image_content?: string;
};

export type WeixinQrStatus = {
  status: string;
  bot_token?: string;
  account_id?: string;
  base_url?: string;
  redirect_host?: string;
  user_id?: string;
};

export type WeixinRawItem = {
  type?: number;
  text_item?: { text?: string };
  voice_item?: { text?: string };
};

export type WeixinRawMessage = {
  from_user_id?: string;
  context_token?: string;
  msg_id?: string;
  item_list?: WeixinRawItem[];
};

export type WeixinUpdates = {
  messages: WeixinRawMessage[];
  cursor: string;
};

export class IlinkError extends Error {
  constructor(
    readonly code:
      | 'invalid_config'
      | 'http_error'
      | 'invalid_response'
      | 'api_error'
      | 'timeout'
      | 'aborted'
      | 'qr_expired'
      | 'qr_failed'
      | 'pin_required'
      | 'verify_code_blocked'
      | 'already_bound'
      | 'auth_rejected'
      | 'auth_expired',
    message: string,
  ) {
    super(message);
    this.name = 'IlinkError';
  }
}

type IlinkApiOptions = {
  botToken: string;
  baseUrl?: string;
  fetch?: FetchLike;
  apiTimeoutMs?: number;
  pollTimeoutMs?: number;
};

export class IlinkApi {
  private readonly baseUrl: string;
  private readonly botToken: string;
  private readonly fetcher: FetchLike;
  private readonly apiTimeoutMs: number;
  private readonly pollTimeoutMs: number;
  private readonly wechatUin = Buffer.from(String(randomBytes(4).readUInt32BE(0)), 'utf8').toString('base64');

  constructor(options: IlinkApiOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_ILINK_BASE_URL);
    this.botToken = options.botToken;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.apiTimeoutMs = positiveMilliseconds(options.apiTimeoutMs ?? 15_000, 'apiTimeoutMs');
    this.pollTimeoutMs = positiveMilliseconds(options.pollTimeoutMs ?? 45_000, 'pollTimeoutMs');
  }

  async getBotQrCode(signal?: AbortSignal, options: { bot_spam_ticket?: string; verify_pin?: boolean } = {}): Promise<WeixinQrCode> {
    const url = this.url('/ilink/bot/get_bot_qrcode');
    url.searchParams.set('bot_type', '3');
    const raw = unwrapData(await this.requestJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local_token_list: [],
        ...(options.bot_spam_ticket ? { bot_spam_ticket: options.bot_spam_ticket } : {}),
        ...(options.verify_pin ? { bot_spam_business_data: Buffer.from(JSON.stringify({ verify_pin: 1 }), 'utf8').toString('base64') } : {}),
      }),
    }, this.apiTimeoutMs, signal));
    const ticket = requiredString(raw.qrcode, 'qrcode');
    const imageContent = optionalString(raw.qrcode_img_content);
    return imageContent === undefined ? { ticket } : { ticket, image_content: imageContent };
  }

  async getQrCodeStatus(ticket: string, signal?: AbortSignal, verifyCode?: string): Promise<WeixinQrStatus> {
    const url = this.url('/ilink/bot/get_qrcode_status');
    url.searchParams.set('qrcode', requiredString(ticket, 'ticket'));
    if (verifyCode !== undefined) url.searchParams.set('verify_code', verifyCode);
    const raw = unwrapData(await this.requestJson(url, { method: 'GET' }, this.pollTimeoutMs, signal));
    const status = requiredString(raw.status, 'status');
    const botToken = optionalString(raw.bot_token);
    const accountId = optionalString(raw.ilink_bot_id);
    const baseUrl = optionalString(raw.baseurl);
    const redirectHost = optionalString(raw.redirect_host);
    const userId = optionalString(raw.ilink_user_id);
    return {
      status,
      ...(botToken === undefined ? {} : { bot_token: botToken }),
      ...(accountId === undefined ? {} : { account_id: accountId }),
      ...(baseUrl === undefined ? {} : { base_url: normalizeBaseUrl(baseUrl) }),
      ...(redirectHost === undefined ? {} : { redirect_host: redirectHost }),
      ...(userId === undefined ? {} : { user_id: userId }),
    };
  }

  async getRealnameTicket(signal?: AbortSignal): Promise<{ ticket: string; auth_url: string; expires_at_ms: number }> {
    const url = new URL(REALNAME_AUTH_URL);
    url.searchParams.set('step', 'get_auth_url');
    url.searchParams.set('plugin_version', WEIXIN_CHANNEL_VERSION);
    const raw = unwrapData(await this.requestJson(url, { method: 'GET' }, this.apiTimeoutMs, signal));
    const ticket = requiredString(raw.bot_spam_ticket, 'binding ticket');
    const authUrl = new URL(requiredString(raw.auth_url, 'authorization URL'));
    if (authUrl.protocol !== 'https:' || authUrl.username || authUrl.password) throw new IlinkError('invalid_response', 'Invalid Weixin authorization URL.');
    const expiresAtMs = Number(raw.expire_time) * 1000;
    if (!/^[a-f0-9]{32}$/i.test(ticket) || !Number.isSafeInteger(expiresAtMs) || expiresAtMs <= Date.now()) {
      throw new IlinkError('invalid_response', 'Invalid or expired Weixin binding ticket.');
    }
    return { ticket, auth_url: authUrl.href, expires_at_ms: expiresAtMs };
  }

  async getRealnameStatus(ticket: string, signal?: AbortSignal): Promise<number> {
    const url = new URL(REALNAME_AUTH_URL);
    url.searchParams.set('step', 'query_auth_result');
    url.searchParams.set('bot_spam_ticket', ticket);
    const raw = unwrapData(await this.requestJson(url, { method: 'GET' }, this.apiTimeoutMs, signal));
    const status = Number(raw.auth_status);
    if (raw.auth_status === undefined || ![0, 1, 2, 3].includes(status)) {
      throw new IlinkError('invalid_response', 'Invalid Weixin authorization status.');
    }
    return status;
  }

  async getUpdates(cursor: string, signal?: AbortSignal): Promise<WeixinUpdates> {
    this.requireBotToken();
    const raw = asRecord(
      await this.requestJson(
        this.url('/ilink/bot/getupdates'),
        {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify({ get_updates_buf: cursor, base_info: BASE_INFO }),
        },
        this.pollTimeoutMs,
        signal,
      ),
      'getupdates response',
    );
    assertApiSuccess(raw);
    const messages = raw.msgs === undefined ? [] : rawMessageArray(raw.msgs);
    const nextCursor = raw.get_updates_buf === undefined
      ? cursor
      : requiredString(raw.get_updates_buf, 'get_updates_buf');
    return { messages, cursor: nextCursor };
  }

  async sendText(
    input: { to_user_id: string; text: string; context_token?: string },
    signal?: AbortSignal,
  ): Promise<void> {
    this.requireBotToken();
    const toUserId = requiredString(input.to_user_id, 'to_user_id');
    const text = requiredString(input.text, 'text');
    const body = {
      msg: {
        to_user_id: toUserId,
        client_id: randomUUID(),
        message_type: 2,
        message_state: 2,
        item_list: [{ type: 1, text_item: { text } }],
        ...(input.context_token === undefined
          ? {}
          : { context_token: requiredString(input.context_token, 'context_token') }),
      },
      base_info: BASE_INFO,
    };
    const raw = asRecord(
      await this.requestJson(
        this.url('/ilink/bot/sendmessage'),
        { method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body) },
        this.apiTimeoutMs,
        signal,
      ),
      'sendmessage response',
    );
    assertApiSuccess(raw);
  }

  private requireBotToken(): void {
    if (this.botToken.length === 0) {
      throw new IlinkError('invalid_config', 'An explicit bot token is required.');
    }
  }

  private authHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      Authorization: `Bearer ${this.botToken}`,
      'X-WECHAT-UIN': this.wechatUin,
    };
  }

  private url(path: string): URL {
    return new URL(path, `${this.baseUrl}/`);
  }

  private async requestJson(
    url: URL,
    init: RequestInit,
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): Promise<unknown> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set('iLink-App-Id', 'bot');
      headers.set('iLink-App-ClientVersion', '512');
      const response = await this.fetcher(url, { ...init, headers, signal: controller.signal });
      if (!response.ok) {
        throw new IlinkError('http_error', `iLink request failed with HTTP ${response.status}.`);
      }
      try {
        return await response.json();
      } catch {
        throw new IlinkError('invalid_response', 'iLink returned invalid JSON.');
      }
    } catch (error) {
      if (error instanceof IlinkError) throw error;
      if (controller.signal.aborted) {
        if (externalSignal?.aborted) throw new IlinkError('aborted', 'iLink request was aborted.');
        throw new IlinkError('timeout', 'iLink request timed out.');
      }
      throw new IlinkError('http_error', 'iLink request failed.');
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', onAbort);
    }
  }
}

export type WeixinQrLoginOptions = {
  base_url?: string;
  fetch?: FetchLike;
  signal?: AbortSignal;
  timeout_ms?: number;
  poll_interval_ms?: number;
  sleep?: Sleep;
  onQrCode?: (qrCode: WeixinQrCode) => void;
  onStatus?: (status: string) => void;
  bind_owner?: 'self' | 'other';
  verify_pin?: boolean;
  onAuthorizationQr?: (challenge: { payload: string; expires_at_ms: number }) => void;
  requestVerifyCode?: (request: { retry: boolean; expires_at_ms: number }) => Promise<string>;
};

export type WeixinQrLoginResult = {
  account_id: string;
  bot_token: string;
  base_url: string;
  user_id?: string;
};

export async function loginWithWeixinQr(options: WeixinQrLoginOptions = {}): Promise<WeixinQrLoginResult> {
  const timeoutMs = positiveMilliseconds(options.timeout_ms ?? 480_000, 'timeout_ms');
  const pollIntervalMs = positiveMilliseconds(options.poll_interval_ms ?? 1_000, 'poll_interval_ms');
  const sleep = options.sleep ?? abortableSleep;
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  const signal = controller.signal;
  const createApi = (baseUrl: string) => new IlinkApi({
    botToken: '', baseUrl,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const api = createApi(options.base_url ?? DEFAULT_ILINK_BASE_URL);
  try {
    let bindingTicket: string | undefined;
    if (options.bind_owner === 'other') {
      let ticket = await api.getRealnameTicket(signal);
      let refreshed = false;
      options.onAuthorizationQr?.({ payload: ticket.auth_url, expires_at_ms: Math.min(deadline, ticket.expires_at_ms) });
      while (true) {
        if (Date.now() >= Math.min(deadline, ticket.expires_at_ms)) throw new IlinkError('auth_expired', 'Weixin authorization expired.');
        const status = await api.getRealnameStatus(ticket.ticket, signal);
        if (status === 1) { bindingTicket = ticket.ticket; break; }
        if (status === 2) throw new IlinkError('auth_rejected', 'Weixin authorization was rejected.');
        if (status === 3) {
          if (refreshed) throw new IlinkError('auth_expired', 'Weixin authorization ticket is invalid.');
          ticket = await api.getRealnameTicket(signal);
          refreshed = true;
          options.onAuthorizationQr?.({ payload: ticket.auth_url, expires_at_ms: Math.min(deadline, ticket.expires_at_ms) });
        }
        await sleep(pollIntervalMs, signal);
      }
    }
    const qrCode = await api.getBotQrCode(signal, {
      ...(bindingTicket ? { bot_spam_ticket: bindingTicket } : {}),
      ...(options.verify_pin === undefined ? {} : { verify_pin: options.verify_pin }),
    });
    options.onQrCode?.(qrCode);
    let pollingApi = api;
    let verifyCode: string | undefined;
    while (Date.now() < deadline) {
      let state: WeixinQrStatus;
      try { state = await pollingApi.getQrCodeStatus(qrCode.ticket, signal, verifyCode); }
      catch (error) {
        // Official QR long polling treats network/gateway timeouts as pending.
        if (!signal.aborted && error instanceof IlinkError && ['timeout', 'http_error'].includes(error.code)) {
          await sleep(pollIntervalMs, signal);
          continue;
        }
        throw error;
      }
      options.onStatus?.(state.status);
      if (state.status.includes('need_verifycode')) {
        if (!options.requestVerifyCode) throw new IlinkError('pin_required', 'Weixin requires the PIN shown on the phone.');
        const request = options.requestVerifyCode({ retry: verifyCode !== undefined, expires_at_ms: deadline });
        verifyCode = await withAbort(request, signal);
        if (!/^[0-9]{1,16}$/.test(verifyCode)) throw new IlinkError('invalid_config', 'Weixin PIN must contain digits only.');
        continue;
      }
      if (state.status === 'scaned' || state.status === 'scanned') verifyCode = undefined;
      if (state.status === 'scaned_but_redirect') {
        if (!state.redirect_host) throw new IlinkError('invalid_response', 'Weixin redirect host is missing.');
        const redirect = new URL(`https://${state.redirect_host}`);
        if (redirect.hostname !== state.redirect_host || !/^ilinkai(?:\.[a-z0-9-]+)*\.weixin\.qq\.com$/.test(redirect.hostname)) {
          throw new IlinkError('invalid_response', 'Weixin redirect host is invalid.');
        }
        pollingApi = createApi(redirect.origin);
      }
      if (state.status === 'confirmed') {
        return {
          account_id: requiredString(state.account_id, 'confirmed account_id'),
          bot_token: requiredString(state.bot_token, 'confirmed bot_token'),
          base_url: state.base_url ?? options.base_url ?? DEFAULT_ILINK_BASE_URL,
          ...(state.user_id ? { user_id: state.user_id } : {}),
        };
      }
      if (state.status === 'expired') throw new IlinkError('qr_expired', 'The Weixin QR login challenge expired.');
      if (state.status === 'verify_code_blocked') throw new IlinkError('verify_code_blocked', 'Weixin PIN attempts are blocked.');
      if (state.status === 'binded_redirect') throw new IlinkError('already_bound', 'This Weixin bot is already bound.');
      if (state.status === 'failed' || state.status === 'cancelled') throw new IlinkError('qr_failed', 'The Weixin QR login challenge failed.');
      await sleep(pollIntervalMs, signal);
    }
    throw new IlinkError('qr_expired', 'The Weixin QR login challenge expired.');
  } catch (error) {
    if (signal.aborted && !options.signal?.aborted) throw new IlinkError('timeout', 'Weixin login timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

function withAbort<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new IlinkError('aborted', 'Weixin login was cancelled.'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IlinkError('invalid_config', 'The iLink base URL is invalid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new IlinkError('invalid_config', 'The iLink base URL must be an HTTPS origin or path.');
  }
  return url.toString().replace(/\/$/, '');
}

function positiveMilliseconds(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new IlinkError('invalid_config', `${field} must be a positive safe integer.`);
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new IlinkError('invalid_response', `${field} must be a non-empty exact string.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : requiredString(value, 'optional string');
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IlinkError('invalid_response', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function unwrapData(value: unknown): Record<string, unknown> {
  const record = asRecord(value, 'iLink response');
  assertApiSuccess(record);
  return record.data === undefined ? record : asRecord(record.data, 'iLink response data');
}

function rawMessageArray(value: unknown): WeixinRawMessage[] {
  if (!Array.isArray(value)) {
    throw new IlinkError('invalid_response', 'msgs must be an array.');
  }
  return value.map((message) => asRecord(message, 'message') as WeixinRawMessage);
}

function assertApiSuccess(value: Record<string, unknown>): void {
  const ret = value.ret ?? 0;
  const errcode = value.errcode ?? 0;
  if (typeof ret !== 'number' || typeof errcode !== 'number') {
    throw new IlinkError('invalid_response', 'iLink API status fields must be numeric.');
  }
  if (ret !== 0 || errcode !== 0) {
    throw new IlinkError('api_error', 'iLink API rejected the request.');
  }
}
