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
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createMockAutomergeRepo = (missions: Partial<Mission>[] = []): any => {
  // store all the mocked docHandles buy their automerge URL
  const mockHandles = new Map<string, MockDocHandle>();

  // Init mock handles for each mission
  missions.forEach((missionData) => {
    const fullMission = generateBlankMission({ ...missionData });

    const mockHandle = {
      doc: vi.fn().mockReturnValue(fullMission),
      whenReady: vi.fn().mockResolvedValue(undefined),
      change: vi.fn((changeFn) => {
        changeFn(fullMission);
        return Promise.resolve();
      }),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      value: vi.fn().mockReturnValue(fullMission),
    };

    // create an automerge doc url by squishing the name together with no spaces
    const url = `automerge:${missionData.name.replace(/\s+/g, "")}`;
    mockHandles.set(url, mockHandle);
  });

  // Function to create a default mock handle for all other real missions
  // in the database. An example of why we need this is when we run
  // getAutomergeDocListings to get all missions.
  // We don't want to return a real mission so mock up responses.
  const createDefaultMockHandle = (): MockDocHandle => ({
    doc: vi.fn().mockReturnValue(generateBlankMission({})),
    whenReady: vi.fn().mockResolvedValue(undefined),
    change: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    value: vi.fn().mockReturnValue(generateBlankMission({})),
  });

  // all the functions for accessing this mocked repo
  return {
    find: vi.fn((url: string) => {
      const handle = mockHandles.get(url);
      return Promise.resolve(handle || createDefaultMockHandle());
    }),
    create: vi.fn((doc: Mission): MockDocHandle => {
      // Generate a unique URL for the new document
      const url = `automerge:${doc.name?.replace(/\s+/g, "") || "NewMission"}`;

      const mockHandle: MockDocHandle = {
        doc: vi.fn().mockReturnValue(doc),
        whenReady: vi.fn().mockResolvedValue(undefined),
        change: vi.fn((changeFn: (doc: Mission) => void) => {
          changeFn(doc);
          return Promise.resolve();
        }),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        value: vi.fn().mockReturnValue(doc),
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
