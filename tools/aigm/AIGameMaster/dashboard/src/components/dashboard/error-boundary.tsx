"use client";

import type React from "react";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label ?? "Panel"}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-4">
          <div className="text-center glass-card rounded-lg p-6 border border-tactical-red/20 max-w-xs">
            <div className="text-tactical-red text-[11px] font-bold tracking-wider uppercase mb-2">
              {this.props.label ?? "Panel Error"}
            </div>
            <div className="text-muted-foreground/50 text-[10px] font-mono break-all">
              {this.state.error instanceof Error
                ? this.state.error.message
                : "An unexpected error occurred"}
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 text-[10px] text-cyan/60 hover:text-cyan transition-colors uppercase tracking-wider"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
