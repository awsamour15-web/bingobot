import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { initAuth, isPhoneVerified, isTelegramContext, isLoggedIn } from '../lib/auth';
import WebLoginScreen from './WebLoginScreen';
export default function RegistrationGate({ children }) {
    const [status, setStatus] = useState('loading');
    const tryAuth = useCallback(async () => {
        setStatus('loading');
        // Web context with an existing valid session — go straight through
        if (!isTelegramContext() && isLoggedIn() && isPhoneVerified()) {
            setStatus('ok');
            return;
        }
        // Web context with no session — show phone login screen
        if (!isTelegramContext() && !isLoggedIn()) {
            setStatus('web-login');
            return;
        }
        // Telegram context — run normal initData auth
        try {
            await initAuth();
            setStatus(isPhoneVerified() ? 'ok' : 'unregistered');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : '';
            if (msg === 'WEB_NO_SESSION') {
                // Should not reach here (guarded above), but handle defensively
                setStatus('web-login');
            }
            else {
                // Auth failed for another reason — let inner screens handle the error
                setStatus('ok');
            }
        }
    }, []);
    useEffect(() => { void tryAuth(); }, [tryAuth]);
    if (status === 'loading') {
        return _jsx("div", { style: { minHeight: '100dvh', background: '#0c0a1e' } });
    }
    if (status === 'web-login') {
        return (_jsx(WebLoginScreen, { onSuccess: () => {
                // After successful web login, re-run auth check to advance to 'ok'
                void tryAuth();
            } }));
    }
    if (status === 'unregistered') {
        // Telegram user who hasn't verified their phone yet
        return (_jsxs("div", { style: {
                minHeight: '100dvh',
                background: 'linear-gradient(180deg, #0e0b25 0%, #0c0a1e 100%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '0 32px', textAlign: 'center', gap: 20,
                fontFamily: "'Nunito', sans-serif",
            }, children: [_jsx("div", { style: { fontSize: 64 }, children: "\uD83D\uDCF1" }), _jsx("div", { style: { fontSize: 22, fontWeight: 900, color: '#f1f5f9', lineHeight: 1.3 }, children: "Register First" }), _jsx("div", { style: { fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 300 }, children: "You need to register your phone number before playing." }), _jsxs("div", { style: {
                        marginTop: 8,
                        background: 'rgba(124,58,237,0.1)',
                        border: '1px solid rgba(124,58,237,0.3)',
                        borderRadius: 18, padding: '18px 22px',
                        maxWidth: 320, width: '100%',
                    }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 800, color: '#a78bfa', marginBottom: 12, letterSpacing: 0.4 }, children: "HOW TO REGISTER" }), _jsxs("div", { style: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 2, textAlign: 'left' }, children: ["1. Tap ", _jsx("strong", { style: { color: '#f1f5f9' }, children: "Register \uD83D\uDCDD" }), " in the bot menu", _jsx("br", {}), "2. Share your phone number", _jsx("br", {}), "3. Come back here to play \uD83C\uDFAE"] })] })] }));
    }
    return _jsx(_Fragment, { children: children });
}
//# sourceMappingURL=RegistrationGate.js.map