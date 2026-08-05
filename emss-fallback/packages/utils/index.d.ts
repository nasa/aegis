/** Ensure `maybeError` is an Error, wrapping it if necessary. */
export declare const asError: (maybeError: unknown, cause?: unknown) => Error;

/** Assert the named env vars are set, returning them as a typed object. */
export declare const assertEnvVarsExist: <T extends Record<keyof T, string>>(
  ...args: (keyof T)[]
) => T;
