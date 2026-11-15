import type { FetchLike, Sleep } from './types.js';
export declare const DEFAULT_ILINK_BASE_URL = "https://ilinkai.weixin.qq.com";
export declare const WEIXIN_PROTOCOL_VERSION = "3.0.0-beta-0";
export declare const WEIXIN_CHANNEL_VERSION = "0.2.0";
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
    text_item?: {
        text?: string;
    };
    voice_item?: {
        text?: string;
    };
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
export declare class IlinkError extends Error {
    readonly code: 'invalid_config' | 'http_error' | 'invalid_response' | 'api_error' | 'timeout' | 'aborted' | 'qr_expired' | 'qr_failed' | 'pin_required' | 'verify_code_blocked' | 'already_bound' | 'auth_rejected' | 'auth_expired';
    constructor(code: 'invalid_config' | 'http_error' | 'invalid_response' | 'api_error' | 'timeout' | 'aborted' | 'qr_expired' | 'qr_failed' | 'pin_required' | 'verify_code_blocked' | 'already_bound' | 'auth_rejected' | 'auth_expired', message: string);
}
type IlinkApiOptions = {
    botToken: string;
    baseUrl?: string;
    fetch?: FetchLike;
    apiTimeoutMs?: number;
    pollTimeoutMs?: number;
};
export declare class IlinkApi {
    private readonly baseUrl;
    private readonly botToken;
    private readonly fetcher;
    private readonly apiTimeoutMs;
    private readonly pollTimeoutMs;
    private readonly wechatUin;
    constructor(options: IlinkApiOptions);
    getBotQrCode(signal?: AbortSignal, options?: {
        bot_spam_ticket?: string;
        verify_pin?: boolean;
    }): Promise<WeixinQrCode>;
    getQrCodeStatus(ticket: string, signal?: AbortSignal, verifyCode?: string): Promise<WeixinQrStatus>;
    getRealnameTicket(signal?: AbortSignal): Promise<{
        ticket: string;
        auth_url: string;
        expires_at_ms: number;
    }>;
    getRealnameStatus(ticket: string, signal?: AbortSignal): Promise<number>;
    getUpdates(cursor: string, signal?: AbortSignal): Promise<WeixinUpdates>;
    sendText(input: {
        to_user_id: string;
        text: string;
        context_token?: string;
    }, signal?: AbortSignal): Promise<void>;
    private requireBotToken;
    private authHeaders;
    private url;
    private requestJson;
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
    onAuthorizationQr?: (challenge: {
        payload: string;
        expires_at_ms: number;
    }) => void;
    requestVerifyCode?: (request: {
        retry: boolean;
        expires_at_ms: number;
    }) => Promise<string>;
};
export type WeixinQrLoginResult = {
    account_id: string;
    bot_token: string;
    base_url: string;
    user_id?: string;
};
export declare function loginWithWeixinQr(options?: WeixinQrLoginOptions): Promise<WeixinQrLoginResult>;
export {};
