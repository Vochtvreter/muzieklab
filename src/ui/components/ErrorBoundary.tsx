import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  children: ReactNode;
  /** Changing it clears a caught error (e.g. new exercise). */
  resetKey?: unknown;
}

/** Keeps one failing part (e.g. the staff) from taking the whole screen down. */
export class ErrorBoundary extends Component<Props, { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: { error: Error | null; key: unknown }) {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
