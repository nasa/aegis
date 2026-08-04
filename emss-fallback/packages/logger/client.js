/**
 * Public-build fallback for `@emss/logger/client`. Remote client logging is
 * disabled in the public build, so these are no-ops. See emss-fallback/README.md.
 */

const noop = () => Promise.resolve();

export const createClientLogger = (_appLoggerEndpoint) => ({
  emergency: noop,
  alert: noop,
  critical: noop,
  debug: noop,
  info: noop,
  notice: noop,
  warning: noop,
  error: noop,
});
