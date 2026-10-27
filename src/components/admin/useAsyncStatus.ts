import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncTaskStatus {
  pending: string | null;
  error: string | null;
  clearError: () => void;
  run: <T>(message: string, task: () => Promise<T>) => Promise<T | undefined>;
}

/** Runs UI tasks with visible feedback and always clears pending state, including on rejection. */
export function useAsyncStatus(initialMessage: string | null = null): AsyncTaskStatus {
  const [pending, setPending] = useState(initialMessage);
  const [error, setError] = useState<string | null>(null);
  const tasks = useRef(new Map<symbol, string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T>(message: string, task: () => Promise<T>) => {
    const id = Symbol();
    tasks.current.set(id, message);
    setError(null);
    setPending(message);
    try {
      return await task();
    } catch (cause) {
      if (mounted.current) {
        setError(
          `${message.replace(/[…\.]+$/, "")}: ${cause instanceof Error ? cause.message : String(cause)}`
        );
      }
      return undefined;
    } finally {
      tasks.current.delete(id);
      if (mounted.current) {
        setPending(Array.from(tasks.current.values()).at(-1) ?? null);
      }
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { pending, error, run, clearError };
}
