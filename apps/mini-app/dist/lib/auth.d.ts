/**
 * Returns true when the app is running inside a Telegram WebView.
 * We check for a non-empty initData string — Telegram always provides it.
 */
export declare function isTelegramContext(): boolean;
/**
 * Returns true only if we have a JWT that hasn't expired yet.
 * A 60-second buffer ensures we re-auth before the token actually expires.
 */
export declare function isLoggedIn(): boolean;
export declare function clearSession(): void;
export declare function initAuth(): Promise<void>;
/**
 * Stores a web login session (JWT + playerId) obtained from /api/auth/web-login.
 * Called by the WebLoginScreen after a successful phone login.
 */
export declare function storeWebSession(params: {
    token: string;
    playerId: string;
    phoneVerified: boolean;
    agentToken?: string;
    agentId?: string;
}): void;
/**
 * Clears the current session and forces a fresh login.
 */
export declare function reAuth(): Promise<void>;
export declare function getPlayerId(): string | null;
export declare function getJwt(): string | null;
export declare function getAgentJwt(): string | null;
export declare function getAgentId(): string | null;
export declare function isPhoneVerified(): boolean;
//# sourceMappingURL=auth.d.ts.map