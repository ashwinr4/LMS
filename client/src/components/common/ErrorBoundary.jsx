import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-app text-app flex items-center justify-center p-6">
          <div className="max-w-md w-full p-8 rounded-card bg-surface dark:bg-dark-surface border border-app shadow-dialog text-center space-y-6 animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-app">Something went wrong</h2>
              <p className="text-xs text-app-secondary leading-relaxed">
                An unexpected error occurred while rendering this section. Our system has caught the issue to prevent total screen loss.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 rounded-btn bg-elevated border border-app text-left font-mono text-[11px] text-red-600 dark:text-red-400 overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-btn bg-brand-600 text-white hover:bg-brand-500 transition-colors shadow-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reload Page
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-btn bg-elevated border border-app text-app hover:bg-slate-200 dark:hover:bg-dark-elevated transition-colors"
              >
                <Home className="h-3.5 w-3.5" />
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
