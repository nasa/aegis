/**
 * Public-build fallback for `@emss/utils`. Faithful re-implementations of the
 * only exports AEGIS imports. See emss-fallback/README.md.
 */

export const asError = (maybeError, cause) => {
  if (maybeError instanceof Error) {
    return maybeError;
  }

  let message;
  if (typeof maybeError === "string") {
    message = maybeError;
  } else {
    try {
      message = JSON.stringify(maybeError);
    } catch {
      message = String(maybeError);
    }
  }

  return cause === undefined ? new Error(message) : new Error(message, { cause });
};

export const assertEnvVarsExist = (...args) => {
  const result = {};
  for (const key of args) {
    const value = process.env[key];
    if (value === undefined) {
      throw new Error(`Required environment variable is not set: ${String(key)}`);
    }
    result[key] = value;
  }
  return result;
};
