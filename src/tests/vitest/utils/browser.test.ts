import { isWindows10 } from "../../../utils/browser";

describe("isWindows10", () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    // Restore original navigator before each test
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Reset the navigator object after each test to avoid polluting other tests
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  test("returns true for Windows 10 using userAgentData", async () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: {
          platform: "Windows",
          brands: [],
          mobile: false,
          getHighEntropyValues: vi.fn().mockResolvedValue({
            platformVersion: "10", // Simulate Windows 10 version
          }),
        },
      },
      configurable: true,
    });

    const result = await isWindows10();
    expect(result).toBe(true);
  });

  test("returns false for Windows 11 or later using userAgentData", async () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: {
          platform: "Windows",
          brands: [],
          mobile: false,
          getHighEntropyValues: vi.fn().mockResolvedValue({
            platformVersion: "13", // Simulate Windows 11 or later
          }),
        },
      },
      configurable: true,
    });

    const result = await isWindows10();
    expect(result).toBe(false);
  });

  test("returns false when userAgentData platform is not Windows", async () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: {
          platform: "MacOS",
          brands: [],
          mobile: false,
          getHighEntropyValues: vi.fn(),
        },
      },
      configurable: true,
    });

    const result = await isWindows10();
    expect(result).toBe(false);
  });

  test("returns false for non-Windows userAgent", async () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15",
      },
      configurable: true,
    });

    const result = await isWindows10();
    expect(result).toBe(false);
  });

  test("returns false if neither userAgentData nor userAgent match", async () => {
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: undefined,
        userAgent: undefined,
      },
      configurable: true,
    });

    const result = await isWindows10();
    expect(result).toBe(false);
  });
});
