export const CHANNEL_PROVIDER_ID = 'opl-channel-weixin' as const;
export const CHANNEL_CALLBACK_API_VERSION = '1.0.0' as const;

export type ChannelConversationIdentity = {
  provider_id: typeof CHANNEL_PROVIDER_ID;
  account_id: string;
  channel_session_id: string;
};

export type CanonicalThreadRef = {
  canonical_thread_host: string;
  canonical_thread_id: string;
};

export type CanonicalTurnRef = CanonicalThreadRef & {
  canonical_turn_id: string;
};

export type ChannelTurnTerminalEvent = CanonicalTurnRef &
  (
    | { status: 'completed'; response_text: string }
    | { status: 'failed'; error: { code: string; message: string } }
    | { status: 'cancelled' }
  );

export type ChannelTurnObserver = {
  onTerminal: (event: ChannelTurnTerminalEvent) => void | Promise<void>;
};

export type ChannelDisposable = {
  dispose: () => void | Promise<void>;
};

export type ChannelTurnCallback = {
  startThread: (input: ChannelConversationIdentity) => Promise<CanonicalThreadRef>;
  resumeThread: (input: CanonicalThreadRef) => Promise<void>;
  startTurn: (input: CanonicalThreadRef & { text: string }) => Promise<CanonicalTurnRef>;
  subscribeTurn: (input: CanonicalTurnRef, observer: ChannelTurnObserver) => ChannelDisposable;
};

export type ChannelProviderStartInput = {
  callback_api_version: typeof CHANNEL_CALLBACK_API_VERSION;
  callback: ChannelTurnCallback;
};

export type ChannelAccessController = {
  readonly data_ref: string;
  readonly action_refs: readonly string[];
  read: (input: Readonly<Record<string, unknown>>) => unknown | Promise<unknown>;
  execute: (input: Readonly<{
    action_ref: string;
    input: Readonly<Record<string, unknown>>;
  }>) => unknown | Promise<unknown>;
};

export type ChannelProviderStatus = 'created' | 'running' | 'stopping' | 'stopped';

export type ChannelProvider = {
  readonly provider_id: typeof CHANNEL_PROVIDER_ID;
  readonly status: ChannelProviderStatus;
  readonly channel_access?: ChannelAccessController;
  start: (input: ChannelProviderStartInput) => Promise<ChannelDisposable>;
  stop: () => Promise<void>;
  dispose: () => Promise<void>;
};

export type WeixinDiagnosticCode =
  | 'poll_failed'
  | 'message_invalid'
  | 'callback_failed'
  | 'turn_identity_mismatch'
  | 'turn_failed'
  | 'turn_cancelled'
  | 'turn_completed_empty'
  | 'send_failed';

export type WeixinDiagnostic = {
  provider_id: typeof CHANNEL_PROVIDER_ID;
  account_id: string;
  code: WeixinDiagnosticCode;
  stage: 'poll' | 'inbound' | 'callback' | 'terminal' | 'send';
  channel_session_id?: string;
  reason_code?: string;
};

export type WeixinProviderConfig = {
  credentials: {
    account_id: string;
    bot_token: string;
    user_id?: string;
  };
  ilink?: {
    base_url?: string;
    api_timeout_ms?: number;
    poll_timeout_ms?: number;
  };
  poll?: {
    backoff_base_ms?: number;
    max_backoff_ms?: number;
  };
  onDiagnostic?: (diagnostic: WeixinDiagnostic) => void;
};

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

export type WeixinProviderDependencies = {
  fetch?: FetchLike;
  sleep?: Sleep;
};

export type WeixinChannelSession = {
  account_id: string;
  base_url: string;
};
