// React Error Boundary
// Catches rendering errors and displays fallback UI

import { Component, type ReactNode } from 'react';
import { errorLogger, parseError } from '../lib/error-handler';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
    const appError = parseError(error);
    errorLogger.log(appError, {
      componentStack: errorInfo.componentStack,
    });
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return (
        <div
          style={{
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
          }}
        >
          <div style={{ fontSize: 64 }}>⚠️</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#f87171' }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20 }}>
              {this.state.error.message}
            </div>
          </div>
          <button
            onClick={this.reset}
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '12px 24px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
