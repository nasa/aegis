import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import clientLogger from "utils/logging/clientLogger";
import { Button } from "./interface/form/globalFields";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// This error boundary is to catch react render errors
// It will not catch errors in event handlers, async code, server side rendering, or errors thrown in the error boundary itself
/**
 * Lifecycle Flow When Error Occurs:
 * 1. Error thrown in descendant component during render
 * 2. getDerivedStateFromError called → updates state to show fallback UI
 * 3. Component re-renders with fallback UI based on new state
 * 4. componentDidCatch called → performs logging and side effects
 */

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  // This static method is called during the "render" phase when an error is thrown by any descendant component.
  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  // This method is called during the "commit" phase after an error has been thrown and the component tree has been updated
  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // log to logging service
    clientLogger.error(error, {
      logId: "react-error-boundary",
      componentStack: errorInfo.componentStack,
    });
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            color: "white",
            display: "flex",
            alignItems: "center",
            flexDirection: "column",
          }}
        >
          <h1>Oops! Something went wrong</h1>
          <p style={{ textAlign: "center" }}>
            Refresh the browser to restart AEGIS. <br />
            This error has been logged and sent to the developers.
          </p>

          <Button label="Refresh the page" onClick={() => window.location.reload()} />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
