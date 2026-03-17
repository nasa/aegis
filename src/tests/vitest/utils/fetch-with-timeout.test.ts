import type { Mock } from "vitest";
import { clientFetchWithTimeout } from "../../../utils/fetch-with-timeout";

// Mocking fetch
global.fetch = vi.fn();

describe("clientFetchWithTimeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully fetch data within the timeout", async () => {
    // Mocking Response object as it's not available in Vitest environment
    const mockResponse = { text: () => Promise.resolve("success"), status: 200 } as Response;
    (global.fetch as Mock).mockResolvedValueOnce(mockResponse);

    const result = await clientFetchWithTimeout("https://example.com");

    expect(fetch).toHaveBeenCalledWith("https://example.com", {
      method: "GET",
      signal: expect.any(AbortSignal), // Ensuring the AbortSignal is passed
    });
    expect(result).toBe(mockResponse);
  });

  it("should timeout and abort the fetch request", async () => {
    vi.useFakeTimers(); // Use fake timers to control the timeout

    const abortError = new DOMException("The user aborted a request.", "AbortError");
    (global.fetch as Mock).mockImplementationOnce(
      (_url: string, { signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(abortError)); // Simulate abort
        })
    );

    const promise = clientFetchWithTimeout("https://example.com", {}, 5000);

    // Fast forward time to trigger timeout
    vi.advanceTimersByTime(5000);

    // Run any pending timers, including the abort
    vi.runAllTimers();

    // Wait for the promise to be rejected due to the timeout
    await expect(promise).rejects.toThrow("The user aborted a request.");

    vi.useRealTimers(); // Restore real timers after the test
  }, 15000);

  it("should apply custom requestInit options", async () => {
    const mockResponse = { text: () => Promise.resolve("success"), status: 200 } as Response;
    (global.fetch as Mock).mockResolvedValueOnce(mockResponse);

    const requestInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: "value" }),
    };

    const result = await clientFetchWithTimeout("https://example.com", requestInit);

    expect(fetch).toHaveBeenCalledWith("https://example.com", {
      ...requestInit,
      signal: expect.any(AbortSignal), // Ensuring the AbortSignal is passed
    });
    expect(result).toBe(mockResponse);
  });

  it("should handle fetch errors", async () => {
    (global.fetch as Mock).mockRejectedValueOnce(new Error("Fetch failed"));

    await expect(clientFetchWithTimeout("https://example.com")).rejects.toThrow("Fetch failed");
  });
});
