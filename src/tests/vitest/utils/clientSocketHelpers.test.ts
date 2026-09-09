import { createClientSocket, isProductionServerURL } from "utils/clientSocketHelpers";

const ioMock = vi.hoisted(() =>
  vi.fn((_url: string, _options: Record<string, unknown>) => ({}) as never)
);

vi.mock("socket.io-client", () => ({ io: ioMock }));

describe("isProductionServerURL", () => {
  test("matches the production origin browsers actually pass", () => {
    // Every browser caller passes window.location.origin, not a bare hostname.
    expect(isProductionServerURL("https://aegis.fit.nasa.gov")).toBe(true);
    expect(isProductionServerURL("https://aegis.fit.nasa.gov/")).toBe(true);
  });

  test("matches a bare hostname, which load testing may pass", () => {
    expect(isProductionServerURL("aegis.fit.nasa.gov")).toBe(true);
  });

  test("does not match non-production origins", () => {
    expect(isProductionServerURL("https://aegis-dev.fit.nasa.gov")).toBe(false);
    expect(isProductionServerURL("https://localhost:8000")).toBe(false);
    expect(isProductionServerURL("http://aegis.fit.nasa.gov.evil.test")).toBe(false);
  });
});

describe("createClientSocket", () => {
  beforeEach(() => {
    ioMock.mockClear();
  });

  test("retries forever in production", () => {
    createClientSocket("https://aegis.fit.nasa.gov");
    expect(ioMock.mock.calls[0][1]).toMatchObject({ reconnectionAttempts: Infinity });
  });

  test("uses a bounded retry count everywhere else", () => {
    createClientSocket("https://localhost:8000");
    expect(ioMock.mock.calls[0][1]).toMatchObject({ reconnectionAttempts: 500 });
  });
});
