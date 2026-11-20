import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// React Error Boundary
// Catches rendering errors and displays fallback UI
import { Component } from 'react';
import { errorLogger, parseError } from '../lib/error-handler';
export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        const appError = parseError(error);
        errorLogger.log(appError, {
            componentStack: errorInfo.componentStack,
        });
    }
    reset = () => {
        this.setState({ hasError: false, error: null });
    };
    render() {
        if (this.state.hasError && this.state.error) {
            if (this.props.fallback) {
                return this.props.fallback(this.state.error, this.reset);
            }
            return (_jsxs("div", { style: {
                    height: '100dvh',
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0a0e1a 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    padding: 24,
                    textAlign: 'center',
                    flexDirection: 'column',
                    gap: 20,
                }, children: [_jsx("div", { style: { fontSize: 64 }, children: "\u26A0\uFE0F" }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#f87171' }, children: "Something went wrong" }), _jsx("div", { style: { fontSize: 14, color: '#94a3b8', marginBottom: 20 }, children: this.state.error.message })] }), _jsx("button", { onClick: this.reset, style: {
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 10,
                            padding: '12px 24px',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }, children: "Try Again" })] }));
        }
        return this.props.children;
    }
}
//# sourceMappingURL=ErrorBoundary.js.map