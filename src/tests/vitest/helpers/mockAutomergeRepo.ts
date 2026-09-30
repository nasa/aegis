import * as Automerge from "@automerge/automerge";
import type { Mock } from "vitest";
import { generateBlankMission } from "store/storeUtils/mission";

interface MockDocHandle {
  doc: Mock<() => Mission>;
  whenReady: Mock<() => Promise<void>>;
  change: Mock<(changeFn: (doc: Mission) => void) => Promise<void>>;
  on: Mock;
  off: Mock;
  once: Mock;
  value: Mock<() => Mission>;
  url?: string;
}

/**
 * Creates a mock Automerge repository for server side tests
 * This allows tests to work with mission data without needing a real Automerge repo
 * It returns a mocked instance of a repo that has all the interface calls
 * we use from the real repo
 *
 * Use the real Automerge CRDT engine so that change() callbacks are subject
 * to the same proxy rules as production. This catches two bug classes that
 * a plain-mutation fake silently swallows:
 *   1. Proxy-reference errors (assigning a live proxy ref inside .change())
 *   2. Filter-reassign vs splice (both produce the same plain-JS end-state
 *      but only splice preserves per-element CRDT identity)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createMockAutomergeRepo = (missions: Partial<Mission>[] = []): any => {
  // store all the mocked docHandles buy their automerge URL
  const mockHandles = new Map<string, MockDocHandle>();

  // Init mock handles for each mission
  missions.forEach((missionData) => {
    let currentDoc = Automerge.from(
      generateBlankMission({ ...missionData }) as unknown as Record<string, unknown>
    ) as unknown as Mission;

    const mockHandle = {
      doc: vi.fn().mockImplementation(() => currentDoc),
      whenReady: vi.fn().mockResolvedValue(undefined),
      change: vi.fn((changeFn) => {
        currentDoc = Automerge.change(currentDoc, changeFn);
        return Promise.resolve();
      }),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      value: vi.fn().mockImplementation(() => currentDoc),
    };

    // create an automerge doc url by squishing the name together with no spaces
    const url = `automerge:${missionData.name.replace(/\s+/g, "")}`;
    mockHandles.set(url, mockHandle);
  });

  // Function to create a default mock handle for all other real missions
  // in the database. An example of why we need this is when we run
  // getAutomergeDocListings to get all missions. when the .find() is called
  // ee don't want to return a real mission so mock up responses.
  const createDefaultMockHandle = (): MockDocHandle => {
    let currentDoc = Automerge.from(
      generateBlankMission({}) as unknown as Record<string, unknown>
    ) as unknown as Mission;
    return {
      doc: vi.fn().mockImplementation(() => currentDoc),
      whenReady: vi.fn().mockResolvedValue(undefined),
      change: vi.fn((changeFn) => {
        currentDoc = Automerge.change(currentDoc, changeFn);
        return Promise.resolve();
      }),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      value: vi.fn().mockImplementation(() => currentDoc),
    };
  };

  // all the functions for accessing this mocked repo
  return {
    find: vi.fn((url: string) => {
      const handle = mockHandles.get(url);
      return Promise.resolve(handle || createDefaultMockHandle());
    }),
    create: vi.fn((doc: Mission): MockDocHandle => {
      // Generate a unique URL for the new document
      const url = `automerge:${doc.name?.replace(/\s+/g, "") || "NewMission"}`;

      let currentDoc = Automerge.from(
        doc as unknown as Record<string, unknown>
      ) as unknown as Mission;

      const mockHandle: MockDocHandle = {
        doc: vi.fn().mockImplementation(() => currentDoc),
        whenReady: vi.fn().mockResolvedValue(undefined),
        change: vi.fn((changeFn: (doc: Mission) => void) => {
          currentDoc = Automerge.change(currentDoc, changeFn);
          return Promise.resolve();
        }),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        value: vi.fn().mockImplementation(() => currentDoc),
        url: url,
      };

      // Store the handle so it can be found later
      mockHandles.set(url, mockHandle);

      return mockHandle;
    }),
    delete: vi.fn(),
    handles: Object.fromEntries(mockHandles),
  };
};
