import { Component, type ReactNode } from 'react';
interface Props {
    children: ReactNode;
    fallback?: (error: Error, reset: () => void) => ReactNode;
}
interface State {
    hasError: boolean;
    error: Error | null;
}
export declare class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props);
    static getDerivedStateFromError(error: Error): State;
    componentDidCatch(error: Error, errorInfo: {
        componentStack: string;
    }): void;
    reset: () => void;
    render(): ReactNode;
}
export {};
//# sourceMappingURL=ErrorBoundary.d.ts.map