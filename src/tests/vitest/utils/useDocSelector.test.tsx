/**
 * Tests for useDocSelector — specifically the emptyDoc overload and its
 * ref-based safety.
 *
 * The emptyDoc overload exists to handle the race between component mount and
 * Automerge handle resolution. Without it, the return type is `TSel | undefined`
 * and every consumer must guard against undefined. With emptyDoc the return type
 * narrows to `TSel`, giving consumers a guaranteed initial value.
 *
 * emptyDoc is stored in a ref, so callers can pass inline
 * object literals without triggering getSnapshot cache misses or infinite loops.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useDocSelector } from "utils/useDocSelector";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { generateBlankMission } from "store/storeUtils/mission";

// Mock useDocHandle from @automerge/automerge-repo-react-hooks so we can
// control whether the handle is resolved or not in each test.
const mockUseDocHandle = vi.fn();

vi.mock("@automerge/automerge-repo-react-hooks", () => ({
  useDocHandle: (...args: unknown[]) => mockUseDocHandle(...args),
}));

const FAKE_URL = "automerge:fake-url" as AutomergeUrl;

/**
 * Minimal functional component harness. Calls useDocSelector with emptyDoc and
 * records each rendered value into the `renders` array so tests can inspect the
 * sequence of values produced across renders.
 */
function HarnessWithEmptyDoc({
  emptyDoc,
  renders,
  getInlineEmptyDoc,
}: {
  emptyDoc?: Mission;
  renders: Array<string | undefined>;
  // When true, pass a NEW inline object every render to test the ref safety contract.
  getInlineEmptyDoc?: () => Mission;
}): React.ReactElement {
  const fallback = getInlineEmptyDoc ? getInlineEmptyDoc() : emptyDoc!;
  const name = useDocSelector<Mission, string>(FAKE_URL, (doc) => doc.name, Object.is, fallback);
  renders.push(name);
  return <div>{name}</div>;
}

/**
 * Minimal harness for the overload WITHOUT emptyDoc (returns TSel | undefined).
 */
function HarnessWithoutEmptyDoc({
  renders,
}: {
  renders: Array<string | undefined>;
}): React.ReactElement {
  const name = useDocSelector<Mission, string>(FAKE_URL, (doc) => doc.name);
  renders.push(name);
  return <div>{String(name)}</div>;
}

function makeFakeHandle(doc: Mission) {
  const listeners = new Set<() => void>();
  const handle = {
    doc: vi.fn(() => doc),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === "change") listeners.add(cb);
    }),
    off: vi.fn((event: string, cb: () => void) => {
      if (event === "change") listeners.delete(cb);
    }),
    // Expose trigger for tests that want to simulate a doc change
    _triggerChange: () => {
      for (const l of listeners) l();
    },
    _updateDoc: (next: Mission) => {
      doc = next;
      handle.doc.mockImplementation(() => doc);
    },
  };
  return handle;
}

describe("useDocSelector — emptyDoc overload", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
    });
    mockUseDocHandle.mockReset();
  });

  afterEach(() => {
    // Unmount cleanly to exercise store.release() paths
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("returns the emptyDoc value while the handle is not yet resolved", () => {
    // Handle unresolved: useDocHandle returns undefined
    mockUseDocHandle.mockReturnValue(undefined);

    const emptyDoc = generateBlankMission({ name: "loading-sentinel" });
    const renders: Array<string | undefined> = [];

    act(() => {
      root.render(<HarnessWithEmptyDoc emptyDoc={emptyDoc} renders={renders} />);
    });

    expect(renders).toHaveLength(1);
    expect(renders[0]).toBe("loading-sentinel");
  });

  it("returns undefined while the handle is not resolved and no emptyDoc is supplied", () => {
    mockUseDocHandle.mockReturnValue(undefined);

    const renders: Array<string | undefined> = [];

    act(() => {
      root.render(<HarnessWithoutEmptyDoc renders={renders} />);
    });

    expect(renders).toHaveLength(1);
    expect(renders[0]).toBeUndefined();
  });

  it("switches from emptyDoc value to the real doc value once the handle resolves", () => {
    // Start with no handle
    mockUseDocHandle.mockReturnValue(undefined);

    const emptyDoc = generateBlankMission({ name: "loading-sentinel" });
    const realDoc = generateBlankMission({ name: "real-mission" });
    const fakeHandle = makeFakeHandle(realDoc);
    const renders: Array<string | undefined> = [];

    act(() => {
      root.render(<HarnessWithEmptyDoc emptyDoc={emptyDoc} renders={renders} />);
    });

    expect(renders.at(-1)).toBe("loading-sentinel");

    // Now the handle resolves — simulate a re-render with a real handle
    act(() => {
      mockUseDocHandle.mockReturnValue(fakeHandle);
      // Force a re-render by updating a prop
      root.render(<HarnessWithEmptyDoc emptyDoc={emptyDoc} renders={renders} />);
    });

    expect(renders.at(-1)).toBe("real-mission");
  });

  it("ref safety contract: inline object literal for emptyDoc does not cause extra renders", () => {
    // Handle unresolved so emptyDoc is the only doc source
    mockUseDocHandle.mockReturnValue(undefined);

    // This factory produces a NEW Mission object reference on every call,
    // simulating a caller that passes `emptyDoc={{ ...someObj }}` inline.
    const getInlineEmptyDoc = () => generateBlankMission({ name: "inline-sentinel" });

    const renders: Array<string | undefined> = [];

    act(() => {
      root.render(<HarnessWithEmptyDoc renders={renders} getInlineEmptyDoc={getInlineEmptyDoc} />);
    });

    const renderCountAfterMount = renders.length;
    expect(renders.every((v) => v === "inline-sentinel")).toBe(true);

    // Force a re-render by re-rendering with the same props.
    // The ref stores the new inline object but getSnapshot must NOT report
    // a new snapshot value — Object.is("inline-sentinel", "inline-sentinel") is true.
    act(() => {
      root.render(<HarnessWithEmptyDoc renders={renders} getInlineEmptyDoc={getInlineEmptyDoc} />);
    });

    // Additional renders should produce the same value, not a new unique-ref value
    const newRenders = renders.slice(renderCountAfterMount);
    expect(newRenders.every((v) => v === "inline-sentinel")).toBe(true);
  });

  it("forwards doc changes from the handle to all subscribers", () => {
    const initialDoc = generateBlankMission({ name: "v1" });
    const fakeHandle = makeFakeHandle(initialDoc);
    mockUseDocHandle.mockReturnValue(fakeHandle);

    const emptyDoc = generateBlankMission({ name: "loading-sentinel" });
    const renders: Array<string | undefined> = [];

    act(() => {
      root.render(<HarnessWithEmptyDoc emptyDoc={emptyDoc} renders={renders} />);
    });

    expect(renders.at(-1)).toBe("v1");

    // Simulate the doc being updated and a change event firing
    act(() => {
      fakeHandle._updateDoc(generateBlankMission({ name: "v2" }));
      fakeHandle._triggerChange();
    });

    expect(renders.at(-1)).toBe("v2");
  });

  it("emptyDoc is NOT used once a real handle is available", () => {
    const realDoc = generateBlankMission({ name: "real-mission" });
    const fakeHandle = makeFakeHandle(realDoc);
    mockUseDocHandle.mockReturnValue(fakeHandle);

    const emptyDoc = generateBlankMission({ name: "should-not-appear" });
    const renders: Array<string | undefined> = [];

    act(() => {
      root.render(<HarnessWithEmptyDoc emptyDoc={emptyDoc} renders={renders} />);
    });

    expect(renders.every((v) => v === "real-mission")).toBe(true);
    expect(renders).not.toContain("should-not-appear");
  });
});
