import { createServerLogger } from "@emss/logger";

vi.mock("utils/loadEnv", () => ({}));
vi.mock("@emss/logger", () => ({
  createServerLogger: vi.fn(() => ({ info: vi.fn() })),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("LOG_ENABLE_APP_LOGGING", "true");
  vi.stubEnv("LOG_SERVER_HTTP_ENDPOINT", "https://logging.example.test");
  vi.stubEnv("LOG_DATA_APP_ID", "aegis-test");
  vi.stubEnv("LOG_DATA_SERVER_NAME", "playwright");
  vi.stubEnv("VITE_PUBLIC_CONSOLE_LOG_LEVEL", "warning");
  vi.stubEnv("VITE_PUBLIC_REMOTE_LOG_LEVEL", "debug");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("Playwright override silences all remote logging paths and preserves console diagnostics", async () => {
  vi.stubEnv("AEGIS_TEST_DISABLE_REMOTE_LOGGING", "true");
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {})
  );
  const { rawServerLogger, serverLogger } = await import("utils/logging/serverLogger");
  const entry = { logId: "playwright-test" };
  const error = new Error("test diagnostic");
  const user = { auid: "playwright" } as LaunchpadUser;

  await Promise.all([
    rawServerLogger.emergency(entry),
    rawServerLogger.alert(entry),
    rawServerLogger.critical(error, entry),
    rawServerLogger.error(error, entry),
    rawServerLogger.warning(entry),
    rawServerLogger.notice(entry),
    rawServerLogger.info(entry),
    rawServerLogger.debug(entry),
    rawServerLogger.logUserLogin(user),
    rawServerLogger.forwardFromClient({ ...entry, logLevel: "info" }, user),
  ]);
  serverLogger.info(entry);

  expect(createServerLogger).not.toHaveBeenCalled();
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();

  serverLogger.warning(entry);
  serverLogger.error(entry, error);
  expect(console.warn).toHaveBeenCalledWith(expect.any(String), entry);
  expect(console.error).toHaveBeenCalledWith(expect.any(String), error, entry);
});

test.each([undefined, "false"])("uses the package normally when override is %s", async (value) => {
  vi.stubEnv("AEGIS_TEST_DISABLE_REMOTE_LOGGING", value);
  const { rawServerLogger } = await import("utils/logging/serverLogger");

  expect(createServerLogger).toHaveBeenCalledExactlyOnceWith({
    logEnableAppLogging: true,
    logServerHttpEndpoint: "https://logging.example.test",
    logDataAppId: "aegis-test",
    logDataServerName: "playwright",
  });
  expect(rawServerLogger).toBe(vi.mocked(createServerLogger).mock.results[0].value);
});
