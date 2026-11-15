import { type WeixinQrLoginOptions } from './ilink.js';
import { type ChannelDisposable, type ChannelProvider, type ChannelProviderStatus, type ChannelProviderStartInput, type WeixinChannelSession, type WeixinProviderConfig, type WeixinProviderDependencies } from './types.js';
export declare class WeixinChannelProvider implements ChannelProvider {
    readonly provider_id: "opl-channel-weixin";
    private readonly accountId;
    private readonly ownerUserId;
    private readonly api;
    private readonly sleep;
    private readonly backoffBaseMs;
    private readonly maxBackoffMs;
    private readonly onDiagnostic;
    private readonly activeSubscriptions;
    private readonly activeTerminalTasks;
    private callback;
    private abortController;
    private pollTask;
    private cursor;
    private lifecycle;
    constructor(config: WeixinProviderConfig, dependencies?: WeixinProviderDependencies);
    get status(): ChannelProvider['status'];
    start(input: ChannelProviderStartInput): Promise<ChannelDisposable>;
    stop(): Promise<void>;
    dispose(): Promise<void>;
    private pollLoop;
    private handleIncoming;
    private handleTerminal;
    private trackDisposable;
    private disposeSubscriptions;
    private emit;
}
export declare function createWeixinChannelProvider(config: WeixinProviderConfig, dependencies?: WeixinProviderDependencies): ChannelProvider;
export type WeixinChannelLoginOptions = Readonly<{
    qr?: WeixinQrLoginOptions;
    poll?: WeixinProviderConfig['poll'];
    onDiagnostic?: WeixinProviderConfig['onDiagnostic'];
    dependencies?: WeixinProviderDependencies;
}>;
export declare class WeixinInstalledChannelProvider implements ChannelProvider {
    private readonly contributionLoginOptions;
    readonly provider_id: "opl-channel-weixin";
    readonly channel_access: Readonly<{
        data_ref: "weixin.channel-access#state";
        action_refs: readonly string[];
        read: (input: Readonly<Record<string, unknown>>) => {
            schema_version: string;
            status: string;
            channel_id: string;
            connection: {
                verification_challenge?: {
                    challenge_id: string;
                    expires_at_ms: number;
                    retry: boolean;
                };
                qr_challenge?: {
                    payload: string;
                    expires_at_ms: number;
                };
                reason_code?: string;
                account_display_name?: string;
                state: "pin_required" | "disconnected" | "connecting" | "authorizing" | "qr_ready" | "qr_scanned" | "connected" | "attention";
            };
            actions: {
                command_id: string;
                input: Record<string, unknown>;
            }[];
            pending_pairings: never[];
            authorized_users: never[];
            refresh_after_ms: number;
        };
        execute: (input: Readonly<{
            action_ref: string;
            input: Readonly<Record<string, unknown>>;
        }>) => Promise<{
            schema_version: string;
            status: string;
            channel_id: string;
            connection: {
                verification_challenge?: {
                    challenge_id: string;
                    expires_at_ms: number;
                    retry: boolean;
                };
                qr_challenge?: {
                    payload: string;
                    expires_at_ms: number;
                };
                reason_code?: string;
                account_display_name?: string;
                state: "pin_required" | "disconnected" | "connecting" | "authorizing" | "qr_ready" | "qr_scanned" | "connected" | "attention";
            };
            actions: {
                command_id: string;
                input: Record<string, unknown>;
            }[];
            pending_pairings: never[];
            authorized_users: never[];
            refresh_after_ms: number;
        }>;
    }>;
    private callback;
    private hostLifecycle;
    private loginAbortController;
    private loginTask;
    private sessionHandle;
    private sessionDisposable;
    private contributionRevision;
    private contributionState;
    private contributionQr;
    private contributionReason;
    private pinChallenge;
    private resolvePin;
    constructor(contributionLoginOptions?: WeixinChannelLoginOptions);
    get status(): ChannelProviderStatus;
    get session(): WeixinChannelSession | null;
    start(input: ChannelProviderStartInput): Promise<ChannelDisposable>;
    loginWithQr(options?: WeixinChannelLoginOptions): Promise<WeixinChannelSession>;
    logout(): Promise<void>;
    stop(): Promise<void>;
    dispose(): Promise<void>;
    private performLogin;
    private disposeSession;
    private readContribution;
    private executeContribution;
    private assertContributionInput;
}
export declare function createInstalledWeixinChannelProvider(): WeixinInstalledChannelProvider;
