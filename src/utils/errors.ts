/**
 * Custom error types with recovery suggestions for better LLM handling
 */

export class ElectronMcpError extends Error {
  constructor(
    message: string,
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = 'ElectronMcpError';
  }

  toJSON() {
    return {
      error: this.message,
      suggestion: this.suggestion,
    };
  }
}

export class RefNotFoundError extends ElectronMcpError {
  constructor(ref: string) {
    super(
      `Element ref '${ref}' not found`,
      'Take a new snapshot with browser_snapshot to get fresh element refs'
    );
    this.name = 'RefNotFoundError';
  }
}

export class StaleRefError extends ElectronMcpError {
  constructor(ref: string, snapshotId: string) {
    super(
      `Element ref '${ref}' is from stale snapshot '${snapshotId}'`,
      'Take a new snapshot with browser_snapshot - refs expire after each snapshot'
    );
    this.name = 'StaleRefError';
  }
}

export class AppNotReadyError extends ElectronMcpError {
  constructor() {
    super(
      'Electron app is not ready',
      'The app may be starting up or has crashed. Try the operation again.'
    );
    this.name = 'AppNotReadyError';
  }
}

export class AppClosedError extends ElectronMcpError {
  constructor() {
    super(
      'Electron app has been closed',
      'The application was closed. It will be relaunched on the next tool call.'
    );
    this.name = 'AppClosedError';
  }
}

export class NoWindowError extends ElectronMcpError {
  constructor() {
    super(
      'No window is currently active',
      'Wait for a window to open or check if the app launched correctly'
    );
    this.name = 'NoWindowError';
  }
}

export class TimeoutError extends ElectronMcpError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      'The operation took too long. Try increasing the timeout or check if the app is responsive.'
    );
    this.name = 'TimeoutError';
  }
}

export class LaunchError extends ElectronMcpError {
  constructor(message: string, path?: string) {
    super(
      `Failed to launch Electron app: ${message}`,
      path
        ? `Check that the path exists: ${path}`
        : 'Verify the app path and ensure Electron is installed'
    );
    this.name = 'LaunchError';
  }
}

export class DialogPendingError extends ElectronMcpError {
  constructor() {
    super(
      'A dialog is blocking the page',
      'Use browser_handle_dialog to accept or dismiss the dialog first'
    );
    this.name = 'DialogPendingError';
  }
}

export class EvaluationError extends ElectronMcpError {
  constructor(message: string, isMainProcess: boolean) {
    super(
      `JavaScript evaluation failed: ${message}`,
      isMainProcess
        ? 'Check the JavaScript syntax and ensure it returns a serializable value'
        : 'The code runs in the renderer context. Use electron_evaluate_main for main process.'
    );
    this.name = 'EvaluationError';
  }
}

/**
 * Format an error for MCP response
 */
export function formatError(error: unknown): { error: string; suggestion?: string } {
  if (error instanceof ElectronMcpError) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      suggestion: 'An unexpected error occurred. Try the operation again.',
    };
  }

  return {
    error: String(error),
    suggestion: 'An unexpected error occurred.',
  };
}
