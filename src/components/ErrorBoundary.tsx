import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[220px] p-6 bg-[#121215] border border-red-900/60 rounded m-4 text-zinc-300 font-mono text-xs">
          <div className="flex items-center gap-2 text-red-400 font-bold mb-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span>{this.props.fallbackTitle || "Application Render Interrupted"}</span>
          </div>
          <p className="text-zinc-400 text-center max-w-lg mb-3">
            An unexpected error occurred while rendering the interface:
          </p>
          <pre className="bg-[#0a0a0c] border border-red-950 p-3 rounded text-[11px] text-red-300 max-w-full overflow-x-auto whitespace-pre-wrap mb-4">
            {this.state.error?.message || "Unknown error"}
          </pre>
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e24] hover:bg-[#282832] border border-zinc-700 hover:border-[#c2a472] rounded text-zinc-200 hover:text-white cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#c2a472]" />
              <span>Retry Rendering</span>
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-300 rounded cursor-pointer transition-colors"
            >
              Reload Playground
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
