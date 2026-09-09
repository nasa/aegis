import { withRevalidationParam } from "pages/versionCheck";

describe("withRevalidationParam", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const now = () => Date.now().toString();

  test("adds the parameter to a url that has no query string", () => {
    expect(withRevalidationParam("/mission/50")).toBe(`/mission/50?_revalidate=${now()}`);
  });

  test("appends to a url that already has other parameters", () => {
    expect(withRevalidationParam("/mission/50?tab=evas")).toBe(
      `/mission/50?tab=evas&_revalidate=${now()}`
    );
  });

  test("replaces an existing parameter instead of stacking a second one", () => {
    // The return url is captured from the address bar, so it carries the
    // parameter from a previous trip through the version check page.
    const result = withRevalidationParam("/mission/50?_revalidate=1788984052121");

    expect(result).toBe(`/mission/50?_revalidate=${now()}`);
    expect(result.match(/_revalidate/g)).toHaveLength(1);
  });

  test("collapses parameters that stacked up before this fix shipped", () => {
    const result = withRevalidationParam(
      "/mission/50?_revalidate=1788984052121&_revalidate=1788984938092"
    );

    expect(result).toBe(`/mission/50?_revalidate=${now()}`);
    expect(result.match(/_revalidate/g)).toHaveLength(1);
  });

  test("does not grow the url when applied repeatedly", () => {
    let url = "/mission/50";
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000);
      url = withRevalidationParam(url);
    }

    expect(url).toBe(`/mission/50?_revalidate=${now()}`);
  });

  test("preserves other parameters while replacing the revalidation one", () => {
    expect(withRevalidationParam("/mission/50?tab=evas&_revalidate=1&sort=name")).toBe(
      `/mission/50?tab=evas&_revalidate=${now()}&sort=name`
    );
  });

  test("preserves the hash fragment", () => {
    expect(withRevalidationParam("/mission/50?_revalidate=1#station-3")).toBe(
      `/mission/50?_revalidate=${now()}#station-3`
    );
  });

  test("strips the origin from an absolute same-origin url", () => {
    expect(withRevalidationParam(`${window.location.origin}/mission/50`)).toBe(
      `/mission/50?_revalidate=${now()}`
    );
  });

  test("falls back to the root path when the url cannot be parsed", () => {
    // A lone "?" query on an invalid base is enough to make URL() throw.
    expect(withRevalidationParam("http://")).toBe(`/?_revalidate=${now()}`);
  });
});
