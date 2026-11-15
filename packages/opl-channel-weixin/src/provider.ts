import { randomUUID } from 'node:crypto';
import { boundedExponentialBackoffMs, abortableSleep } from './backoff.js';
import {
  IlinkApi,
  IlinkError,
  loginWithWeixinQr,
  type WeixinQrLoginOptions,
  type WeixinRawItem,
  type WeixinRawMessage,
} from './ilink.js';
import {
  CHANNEL_CALLBACK_API_VERSION,
  CHANNEL_PROVIDER_ID,
  type CanonicalThreadRef,
  type CanonicalTurnRef,
  type ChannelDisposable,
  type ChannelProvider,
  type ChannelProviderStatus,
  type ChannelProviderStartInput,
  type ChannelTurnCallback,
  type ChannelTurnTerminalEvent,
  type Sleep,
  type WeixinChannelSession,
  type WeixinDiagnostic,
  type WeixinProviderConfig,
  type WeixinProviderDependencies,
} from './types.js';

const DEFAULT_BACKOFF_BASE_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 600_000;
const WEIXIN_CHANNEL_ID = 'weixin';
const WEIXIN_STATE_REF = 'weixin.channel-access#state';
const WEIXIN_CONNECT_REF = 'weixin.channel-access#connect';
const WEIXIN_DISCONNECT_REF = 'weixin.channel-access#disconnect';
const WEIXIN_CONNECT_OTHER_REF = 'weixin.channel-access#connect-other';
const WEIXIN_SUBMIT_PIN_REF = 'weixin.channel-access#submit-pin';

type TrackedDisposable = ChannelDisposable & { disposed: boolean };

export class WeixinChannelProvider implements ChannelProvider {
  readonly provider_id = CHANNEL_PROVIDER_ID;

  private readonly accountId: string;
  private readonly ownerUserId: string | undefined;
  private readonly api: IlinkApi;
  private readonly sleep: Sleep;
  private readonly backoffBaseMs: number;
  private readonly maxBackoffMs: number;
  private readonly onDiagnostic: ((diagnostic: WeixinDiagnostic) => void) | undefined;
  private readonly activeSubscriptions = new Set<TrackedDisposable>();
  private readonly activeTerminalTasks = new Set<Promise<void>>();

  private callback: ChannelTurnCallback | null = null;
  private abortController: AbortController | null = null;
  private pollTask: Promise<void> | null = null;
  private cursor = '';
  private lifecycle: ChannelProvider['status'] = 'created';

  constructor(config: WeixinProviderConfig, dependencies: WeixinProviderDependencies = {}) {
    this.accountId = exactConfigString(config.credentials.account_id, 'account_id');
    this.ownerUserId = config.credentials.user_id;
    const botToken = exactConfigString(config.credentials.bot_token, 'bot_token');
    this.api = new IlinkApi({
      botToken,
      ...(config.ilink?.base_url === undefined ? {} : { baseUrl: config.ilink.base_url }),
      ...(config.ilink?.api_timeout_ms === undefined ? {} : { apiTimeoutMs: config.ilink.api_timeout_ms }),
      ...(config.ilink?.poll_timeout_ms === undefined ? {} : { pollTimeoutMs: config.ilink.poll_timeout_ms }),
      ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
    });
    this.sleep = dependencies.sleep ?? abortableSleep;
    this.backoffBaseMs = positiveMilliseconds(
      config.poll?.backoff_base_ms ?? DEFAULT_BACKOFF_BASE_MS,
      'backoff_base_ms',
    );
    this.maxBackoffMs = positiveMilliseconds(
      config.poll?.max_backoff_ms ?? DEFAULT_MAX_BACKOFF_MS,
      'max_backoff_ms',
    );
    if (this.maxBackoffMs < this.backoffBaseMs) {
      throw new TypeError('max_backoff_ms must be at least backoff_base_ms.');
    }
    this.onDiagnostic = config.onDiagnostic;
  }

  get status(): ChannelProvider['status'] {
    return this.lifecycle;
  }

  async start(input: ChannelProviderStartInput): Promise<ChannelDisposable> {
    if (this.lifecycle !== 'created') {
      throw new Error(`Provider cannot start from ${this.lifecycle} state.`);
    }
    if (input.callback_api_version !== CHANNEL_CALLBACK_API_VERSION) {
      throw new Error(`Unsupported channel callback API version: ${String(input.callback_api_version)}.`);
    }
    assertCallbackShape(input.callback);
    this.callback = input.callback;
    this.abortController = new AbortController();
    this.lifecycle = 'running';
    this.pollTask = this.pollLoop(this.abortController.signal);
    return Object.freeze({ dispose: () => this.stop() });
  }

  async stop(): Promise<void> {
    if (this.lifecycle === 'stopped') return;
    if (this.lifecycle === 'created') {
      this.lifecycle = 'stopped';
      return;
    }
    this.lifecycle = 'stopping';
    this.abortController?.abort();
    await this.disposeSubscriptions();
    await this.pollTask;
    await this.disposeSubscriptions();
    await Promise.allSettled([...this.activeTerminalTasks]);
    this.activeTerminalTasks.clear();
    this.cursor = '';
    this.callback = null;
    this.abortController = null;
    this.pollTask = null;
    this.lifecycle = 'stopped';
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  private async pollLoop(signal: AbortSignal): Promise<void> {
    let consecutiveFailures = 0;
    while (!signal.aborted) {
      try {
        const updates = await this.api.getUpdates(this.cursor, signal);
        this.cursor = updates.cursor;
        consecutiveFailures = 0;
        for (const message of updates.messages) {
          if (signal.aborted) break;
          await this.handleIncoming(message, signal);
        }
      } catch (error) {
        if (signal.aborted || isAbortLike(error)) break;
        consecutiveFailures += 1;
        this.emit({ code: 'poll_failed', stage: 'poll', reason_code: diagnosticReason(error) });
        const delay = boundedExponentialBackoffMs(
          consecutiveFailures,
          this.backoffBaseMs,
          this.maxBackoffMs,
        );
        try {
          await this.sleep(delay, signal);
        } catch (sleepError) {
          if (!signal.aborted && !isAbortLike(sleepError)) {
            this.emit({ code: 'poll_failed', stage: 'poll', reason_code: 'backoff_failed' });
          }
          break;
        }
      }
    }
  }

  private async handleIncoming(message: WeixinRawMessage, signal: AbortSignal): Promise<void> {
    const channelSessionId = exactString(message.from_user_id);
    const text = messageText(message.item_list);
    if (!channelSessionId || !text || signal.aborted) {
      this.emit({
        code: 'message_invalid',
        stage: 'inbound',
        ...(channelSessionId === undefined ? {} : { channel_session_id: channelSessionId }),
        reason_code: channelSessionId === undefined ? 'missing_sender' : 'missing_text',
      });
      return;
    }

    if (this.ownerUserId && channelSessionId !== this.ownerUserId) return;
    const callback = this.callback;
    if (!callback) return;
    const identity = {
      provider_id: CHANNEL_PROVIDER_ID,
      account_id: this.accountId,
      channel_session_id: channelSessionId,
    } as const;
    let thread: CanonicalThreadRef;
    let turn: CanonicalTurnRef;
    try {
      thread = validateThreadRef(await callback.startThread(identity));
      await callback.resumeThread(thread);
      turn = validateTurnRef(await callback.startTurn({ ...thread, text }));
      if (!sameThread(thread, turn)) throw new Error('turn_thread_mismatch');
    } catch (error) {
      this.emit({
        code: 'callback_failed',
        stage: 'callback',
        channel_session_id: channelSessionId,
        reason_code: diagnosticReason(error),
      });
      return;
    }

    let tracked: TrackedDisposable | undefined;
    let disposeAfterSubscribe = false;
    let terminalHandled = false;
    const onTerminal = (event: ChannelTurnTerminalEvent): Promise<void> => {
      if (terminalHandled) return Promise.resolve();
      terminalHandled = true;
      const task = (async () => {
        try {
          await this.handleTerminal(channelSessionId, message.context_token, turn, event, signal);
        } catch (error) {
          this.emit({
            code: 'callback_failed',
            stage: 'terminal',
            channel_session_id: channelSessionId,
            reason_code: diagnosticReason(error),
          });
        } finally {
          if (tracked) {
            try {
              await tracked.dispose();
            } catch (error) {
              this.emit({
                code: 'callback_failed',
                stage: 'terminal',
                channel_session_id: channelSessionId,
                reason_code: diagnosticReason(error),
              });
            }
          } else {
            disposeAfterSubscribe = true;
          }
        }
      })();
      this.activeTerminalTasks.add(task);
      void task.then(
        () => this.activeTerminalTasks.delete(task),
        () => this.activeTerminalTasks.delete(task),
      );
      return task;
    };

    try {
      tracked = this.trackDisposable(callback.subscribeTurn(turn, { onTerminal }));
      if (disposeAfterSubscribe) await tracked.dispose();
    } catch (error) {
      this.emit({
        code: 'callback_failed',
        stage: 'callback',
        channel_session_id: channelSessionId,
        reason_code: diagnosticReason(error),
      });
    }
  }

  private async handleTerminal(
    channelSessionId: string,
    contextToken: string | undefined,
    turn: CanonicalTurnRef,
    event: ChannelTurnTerminalEvent,
    signal: AbortSignal,
  ): Promise<void> {
    if (!sameTurn(turn, event)) {
      this.emit({
        code: 'turn_identity_mismatch',
        stage: 'terminal',
        channel_session_id: channelSessionId,
        reason_code: 'terminal_ref_mismatch',
      });
      return;
    }
    if (event.status === 'failed') {
      this.emit({
        code: 'turn_failed',
        stage: 'terminal',
        channel_session_id: channelSessionId,
        reason_code: event.error.code,
      });
      return;
    }
    if (event.status === 'cancelled') {
      this.emit({
        code: 'turn_cancelled',
        stage: 'terminal',
        channel_session_id: channelSessionId,
        reason_code: 'cancelled',
      });
      return;
    }
    if (event.response_text.length === 0 || event.response_text.trim().length === 0) {
      this.emit({
        code: 'turn_completed_empty',
        stage: 'terminal',
        channel_session_id: channelSessionId,
        reason_code: 'empty_response',
      });
      return;
    }
    try {
      await this.api.sendText(
        {
          to_user_id: channelSessionId,
          text: event.response_text,
          ...(contextToken === undefined ? {} : { context_token: contextToken }),
        },
        signal,
      );
    } catch (error) {
      this.emit({
        code: 'send_failed',
        stage: 'send',
        channel_session_id: channelSessionId,
        reason_code: diagnosticReason(error),
      });
    }
  }

  private trackDisposable(disposable: ChannelDisposable): TrackedDisposable {
    if (!disposable || typeof disposable.dispose !== 'function') {
      throw new Error('subscribeTurn must return a disposable.');
    }
    const tracked = {
      disposed: false,
      dispose: async () => {
        if (tracked.disposed) return;
        tracked.disposed = true;
        this.activeSubscriptions.delete(tracked);
        await disposable.dispose();
      },
    } as TrackedDisposable;
    this.activeSubscriptions.add(tracked);
    return tracked;
  }

  private async disposeSubscriptions(): Promise<void> {
    await Promise.allSettled([...this.activeSubscriptions].map((subscription) => subscription.dispose()));
  }

  private emit(input: Omit<WeixinDiagnostic, 'provider_id' | 'account_id'>): void {
    try {
      this.onDiagnostic?.({ provider_id: CHANNEL_PROVIDER_ID, account_id: this.accountId, ...input });
    } catch {
      // Diagnostics are observer-only and must not stop transport teardown.
    }
  }
}

export function createWeixinChannelProvider(
  config: WeixinProviderConfig,
  dependencies?: WeixinProviderDependencies,
): ChannelProvider {
  return new WeixinChannelProvider(config, dependencies);
}

export type WeixinChannelLoginOptions = Readonly<{
  qr?: WeixinQrLoginOptions;
  poll?: WeixinProviderConfig['poll'];
  onDiagnostic?: WeixinProviderConfig['onDiagnostic'];
  dependencies?: WeixinProviderDependencies;
}>;

export class WeixinInstalledChannelProvider implements ChannelProvider {
  readonly provider_id = CHANNEL_PROVIDER_ID;

  readonly channel_access = Object.freeze({
    data_ref: WEIXIN_STATE_REF,
    action_refs: Object.freeze([WEIXIN_CONNECT_REF, WEIXIN_CONNECT_OTHER_REF, WEIXIN_SUBMIT_PIN_REF, WEIXIN_DISCONNECT_REF]),
    read: (input: Readonly<Record<string, unknown>>) => this.readContribution(input),
    execute: (input: Readonly<{
      action_ref: string;
      input: Readonly<Record<string, unknown>>;
    }>) => this.executeContribution(input),
  });

  private callback: ChannelTurnCallback | null = null;
  private hostLifecycle: ChannelProviderStatus = 'created';
  private loginAbortController: AbortController | null = null;
  private loginTask: Promise<WeixinChannelSession> | null = null;
  private sessionHandle: WeixinChannelSession | null = null;
  private sessionDisposable: ChannelDisposable | null = null;
  private contributionRevision = 0;
  private contributionState: 'disconnected' | 'connecting' | 'authorizing' | 'qr_ready' | 'qr_scanned' | 'pin_required' | 'connected' | 'attention' = 'disconnected';
  private contributionQr: { payload: string; expires_at_ms: number } | null = null;
  private contributionReason: string | null = null;
  private pinChallenge: { challenge_id: string; expires_at_ms: number; retry: boolean } | null = null;
  private resolvePin: ((code: string) => void) | null = null;

  constructor(private readonly contributionLoginOptions: WeixinChannelLoginOptions = {}) {}

  get status(): ChannelProviderStatus {
    return this.hostLifecycle;
  }

  get session(): WeixinChannelSession | null {
    return this.sessionHandle === null ? null : { ...this.sessionHandle };
  }

  async start(input: ChannelProviderStartInput): Promise<ChannelDisposable> {
    if (this.hostLifecycle === 'running' || this.hostLifecycle === 'stopping') {
      throw new Error(`Provider cannot start from ${this.hostLifecycle} state.`);
    }
    if (input.callback_api_version !== CHANNEL_CALLBACK_API_VERSION) {
      throw new Error(`Unsupported channel callback API version: ${String(input.callback_api_version)}.`);
    }
    assertCallbackShape(input.callback);
    this.callback = input.callback;
    this.hostLifecycle = 'running';
    return Object.freeze({ dispose: () => this.stop() });
  }

  loginWithQr(options: WeixinChannelLoginOptions = {}): Promise<WeixinChannelSession> {
    if (this.hostLifecycle !== 'running' || !this.callback) {
      return Promise.reject(new Error('Provider must be attached before Weixin login.'));
    }
    if (this.sessionDisposable || this.loginTask) {
      return Promise.reject(new Error('A Weixin channel session is already active or connecting.'));
    }
    const abortController = new AbortController();
    this.loginAbortController = abortController;
    const externalSignal = options.qr?.signal;
    const onExternalAbort = () => abortController.abort();
    if (externalSignal?.aborted) abortController.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
    const revision = ++this.contributionRevision;
    const timeoutMs = options.qr?.timeout_ms ?? 480_000;
    this.contributionState = 'connecting';
    this.pinChallenge = null;
    this.resolvePin = null;
    this.contributionQr = null;
    this.contributionReason = null;
    const externalOnQrCode = options.qr?.onQrCode;
    const externalOnStatus = options.qr?.onStatus;
    const task = this.performLogin({
      ...options,
      qr: {
        ...options.qr,
        onAuthorizationQr: (challenge) => {
          options.qr?.onAuthorizationQr?.(challenge);
          if (this.contributionRevision !== revision) return;
          this.contributionState = 'authorizing';
          this.contributionQr = { ...challenge };
        },
        requestVerifyCode: options.qr?.requestVerifyCode ?? ((request) => {
          if (this.contributionRevision !== revision || abortController.signal.aborted) {
            return Promise.reject(new IlinkError('aborted', 'Weixin login was cancelled.'));
          }
          this.contributionState = 'pin_required';
          this.contributionQr = null;
          this.pinChallenge = { challenge_id: randomUUID(), ...request };
          return new Promise<string>((resolve) => { this.resolvePin = resolve; });
        }),
        onQrCode: (qrCode) => {
          externalOnQrCode?.(qrCode);
          if (this.contributionRevision !== revision) return;
          this.contributionState = 'qr_ready';
          this.contributionQr = {
            payload: qrCode.image_content ?? qrCode.ticket,
            expires_at_ms: Date.now() + timeoutMs,
          };
        },
        onStatus: (status) => {
          externalOnStatus?.(status);
          if (this.contributionRevision === revision && (status === 'scanned' || status === 'scaned')) {
            this.contributionState = 'qr_scanned';
          }
        },
      },
    }, abortController.signal).then((session) => {
      if (this.contributionRevision === revision) {
        this.contributionState = 'connected';
        this.pinChallenge = null;
        this.resolvePin = null;
        this.contributionQr = null;
        this.contributionReason = null;
      }
      return session;
    }, (error: unknown) => {
      if (this.contributionRevision === revision) {
        this.contributionState = 'attention';
        this.pinChallenge = null;
        this.resolvePin = null;
        this.contributionQr = null;
        this.contributionReason = diagnosticReason(error);
      }
      throw error;
    });
    this.loginTask = task;
    void task.finally(() => {
      externalSignal?.removeEventListener('abort', onExternalAbort);
      if (this.loginTask === task) this.loginTask = null;
      if (this.loginAbortController === abortController) this.loginAbortController = null;
    }).catch(() => {});
    return task;
  }

  async logout(): Promise<void> {
    this.contributionRevision += 1;
    this.loginAbortController?.abort();
    if (this.loginTask) await this.loginTask.catch(() => {});
    await this.disposeSession();
    this.contributionState = 'disconnected';
    this.pinChallenge = null;
    this.resolvePin = null;
    this.contributionQr = null;
    this.contributionReason = null;
  }

  async stop(): Promise<void> {
    if (this.hostLifecycle === 'stopped') return;
    if (this.hostLifecycle === 'created') {
      this.hostLifecycle = 'stopped';
      return;
    }
    this.hostLifecycle = 'stopping';
    await this.logout();
    this.callback = null;
    this.hostLifecycle = 'stopped';
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  private async performLogin(
    options: WeixinChannelLoginOptions,
    signal: AbortSignal,
  ): Promise<WeixinChannelSession> {
    const credentials = await loginWithWeixinQr({ ...options.qr, signal });
    if (signal.aborted || this.hostLifecycle !== 'running' || !this.callback) {
      throw new IlinkError('aborted', 'Weixin login completed after the provider detached.');
    }
    const fetcher = options.dependencies?.fetch ?? options.qr?.fetch;
    const provider = createWeixinChannelProvider({
      credentials: {
        account_id: credentials.account_id,
        bot_token: credentials.bot_token,
        ...(credentials.user_id ? { user_id: credentials.user_id } : {}),
      },
      ilink: { base_url: credentials.base_url },
      ...(options.poll === undefined ? {} : { poll: options.poll }),
      ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
    }, {
      ...(fetcher === undefined ? {} : { fetch: fetcher }),
      ...(options.dependencies?.sleep === undefined
        ? {}
        : { sleep: options.dependencies.sleep }),
    });
    const disposable = await provider.start({
      callback_api_version: CHANNEL_CALLBACK_API_VERSION,
      callback: this.callback,
    });
    if (signal.aborted || this.hostLifecycle !== 'running') {
      await disposable.dispose();
      throw new IlinkError('aborted', 'Weixin login completed after the provider detached.');
    }
    const session = Object.freeze({
      account_id: credentials.account_id,
      base_url: credentials.base_url,
    });
    this.sessionDisposable = disposable;
    this.sessionHandle = session;
    return { ...session };
  }

  private async disposeSession(): Promise<void> {
    const disposable = this.sessionDisposable;
    this.sessionDisposable = null;
    this.sessionHandle = null;
    if (disposable) await disposable.dispose();
  }

  private readContribution(input: Readonly<Record<string, unknown>>) {
    this.assertContributionInput(input);
    if (
      this.contributionState === 'qr_ready'
      && this.contributionQr
      && this.contributionQr.expires_at_ms <= Date.now()
    ) {
      this.contributionState = 'attention';
      this.contributionQr = null;
      this.contributionReason = 'qr_expired';
    }
    const channelInput = { channel_id: WEIXIN_CHANNEL_ID };
    const actions: Array<{ command_id: string; input: Record<string, unknown> }> = this.contributionState === 'connected'
      || this.contributionState === 'connecting'
      || this.contributionState === 'authorizing'
      || this.contributionState === 'pin_required'
      || this.contributionState === 'qr_ready'
      || this.contributionState === 'qr_scanned'
      ? [{ command_id: 'weixin-disconnect', input: { channel_id: WEIXIN_CHANNEL_ID } }]
      : [{ command_id: 'weixin-connect', input: channelInput }, { command_id: 'weixin-connect-other', input: channelInput }];
    if (this.contributionState === 'pin_required' && this.pinChallenge) {
      actions.unshift({ command_id: 'weixin-submit-pin', input: { ...channelInput, challenge_id: this.pinChallenge.challenge_id } });
    }
    return {
      schema_version: 'opl-app-channel-access.v1',
      status: 'available',
      channel_id: WEIXIN_CHANNEL_ID,
      connection: {
        state: this.contributionState,
        ...(this.sessionHandle?.account_id
          ? { account_display_name: this.sessionHandle.account_id }
          : {}),
        ...(this.contributionReason ? { reason_code: this.contributionReason } : {}),
        ...(['qr_ready', 'authorizing'].includes(this.contributionState) && this.contributionQr
          ? { qr_challenge: { ...this.contributionQr } }
          : {}),
        ...(this.contributionState === 'pin_required' && this.pinChallenge ? { verification_challenge: { ...this.pinChallenge } } : {}),
      },
      actions,
      pending_pairings: [],
      authorized_users: [],
      refresh_after_ms: 1_000,
    };
  }

  private async executeContribution(input: Readonly<{
    action_ref: string;
    input: Readonly<Record<string, unknown>>;
  }>) {
    if (input.action_ref === WEIXIN_SUBMIT_PIN_REF) {
      const { channel_id, challenge_id, verify_code } = input.input;
      if (Object.keys(input.input).some(key => !['channel_id', 'challenge_id', 'verify_code'].includes(key))
        || channel_id !== WEIXIN_CHANNEL_ID || typeof verify_code !== 'string' || !/^[0-9]{1,16}$/.test(verify_code)
        || !this.pinChallenge || challenge_id !== this.pinChallenge.challenge_id || !this.resolvePin
        || this.contributionState !== 'pin_required' || this.pinChallenge.expires_at_ms <= Date.now()) {
        throw new TypeError('Invalid or expired Weixin PIN challenge.');
      }
      const resolve = this.resolvePin;
      this.resolvePin = null;
      this.pinChallenge = null;
      this.contributionState = 'connecting';
      resolve(verify_code);
      return this.readContribution({ channel_id: WEIXIN_CHANNEL_ID });
    }
    this.assertContributionInput(input.input);
    if (input.action_ref === WEIXIN_CONNECT_REF || input.action_ref === WEIXIN_CONNECT_OTHER_REF) {
      if (this.hostLifecycle !== 'running') {
        throw new Error('Provider must be attached before Weixin login.');
      }
      if (this.sessionDisposable || this.loginTask) {
        throw new Error('A Weixin channel session is already active or connecting.');
      }
      void this.loginWithQr({
        ...this.contributionLoginOptions,
        qr: { ...this.contributionLoginOptions.qr, bind_owner: input.action_ref === WEIXIN_CONNECT_OTHER_REF ? 'other' : 'self' },
      }).catch(() => {});
      return this.readContribution(input.input);
    }
    if (input.action_ref === WEIXIN_DISCONNECT_REF) {
      await this.logout();
      return this.readContribution(input.input);
    }
    throw new Error(`Unsupported Weixin contribution action ref: ${input.action_ref}`);
  }

  private assertContributionInput(input: Readonly<Record<string, unknown>>): void {
    const keys = Object.keys(input);
    if (
      keys.some((key) => key !== 'channel_id')
      || (input.channel_id !== undefined && input.channel_id !== WEIXIN_CHANNEL_ID)
    ) {
      throw new TypeError('Weixin contribution input must target channel_id weixin only.');
    }
  }
}

export function createInstalledWeixinChannelProvider(): WeixinInstalledChannelProvider {
  return new WeixinInstalledChannelProvider();
}

function assertCallbackShape(callback: ChannelTurnCallback): void {
  if (!callback || typeof callback !== 'object') throw new TypeError('A callback object is required.');
  const allowed = new Set(['startThread', 'resumeThread', 'startTurn', 'subscribeTurn']);
  for (const key of Object.keys(callback)) {
    if (!allowed.has(key)) throw new TypeError(`Unsupported channel callback: ${key}.`);
  }
  for (const key of allowed) {
    if (typeof callback[key as keyof ChannelTurnCallback] !== 'function') {
      throw new TypeError(`Channel callback ${key} is required.`);
    }
  }
}

function validateThreadRef(value: CanonicalThreadRef): CanonicalThreadRef {
  return {
    canonical_thread_host: exactConfigString(value?.canonical_thread_host, 'canonical_thread_host'),
    canonical_thread_id: exactConfigString(value?.canonical_thread_id, 'canonical_thread_id'),
  };
}

function validateTurnRef(value: CanonicalTurnRef): CanonicalTurnRef {
  return {
    ...validateThreadRef(value),
    canonical_turn_id: exactConfigString(value?.canonical_turn_id, 'canonical_turn_id'),
  };
}

function sameThread(left: CanonicalThreadRef, right: CanonicalThreadRef): boolean {
  return left.canonical_thread_host === right.canonical_thread_host
    && left.canonical_thread_id === right.canonical_thread_id;
}

function sameTurn(left: CanonicalTurnRef, right: CanonicalTurnRef): boolean {
  return sameThread(left, right) && left.canonical_turn_id === right.canonical_turn_id;
}

function messageText(items: WeixinRawItem[] | undefined): string | undefined {
  if (!Array.isArray(items)) return undefined;
  const parts = items.flatMap((item) => {
    if (item.type === 1) return typeof item.text_item?.text === 'string' ? [item.text_item.text] : [];
    if (item.type === 3) return typeof item.voice_item?.text === 'string' ? [item.voice_item.text] : [];
    return [];
  });
  const text = parts.join('\n');
  return text.trim().length === 0 ? undefined : text;
}

function exactString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value === value.trim() ? value : undefined;
}

function exactConfigString(value: unknown, field: string): string {
  const result = exactString(value);
  if (!result) throw new TypeError(`${field} must be a non-empty exact string.`);
  return result;
}

function positiveMilliseconds(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${field} must be positive.`);
  return value;
}

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function diagnosticReason(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return error instanceof Error && error.name === 'AbortError' ? 'aborted' : 'unknown_error';
}
