/**
 * Public-build fallback for `@emss/logger` (server entry). The real package
 * streams logs to a remote Logstash server; in the public build remote logging
 * is disabled, so these are no-ops. Console output is still handled by
 * src/utils/logging/consoleLogger.ts. See emss-fallback/README.md.
 */

const noop = () => Promise.resolve();

export const createServerLogger = (_props) => ({
  emergency: noop,
  alert: noop,
  critical: noop,
  error: noop,
  warning: noop,
  notice: noop,
  info: noop,
  debug: noop,
  forwardFromClient: noop,
  logUserLogin: noop,
});

export const sendClientLogsToLogstash = ({ res }) => res.status(200).json({ status: "ok" });
