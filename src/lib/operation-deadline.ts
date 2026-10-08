export class OperationDeadlineError extends Error {
  readonly code = "OPERATION_DEADLINE";
  constructor() { super("Operation deadline exceeded"); this.name = "OperationDeadlineError"; }
}

// Attaches settlement handlers to late work; never retries or claims cancellation.
export function withOperationDeadline<T>(
  operation: () => T | PromiseLike<T>, milliseconds: number, onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { onTimeout?.(); } catch { /* recovery cannot hide the bounded failure */ }
      reject(new OperationDeadlineError());
    }, milliseconds);
    timer.unref?.();
    Promise.resolve().then(operation).then(value => {
      if (finished) return;
      finished = true; clearTimeout(timer); resolve(value);
    }, error => {
      if (finished) return;
      finished = true; clearTimeout(timer); reject(error);
    });
  });
}
