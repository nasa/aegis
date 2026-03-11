import { generateBlankMission } from "store/storeUtils/mission";

interface MockDocHandle {
  doc: jest.Mock<Mission, []>;
  whenReady: jest.Mock<Promise<void>, []>;
  change: jest.Mock<Promise<void>, [(doc: Mission) => void]>;
  on: jest.Mock;
  off: jest.Mock;
  once: jest.Mock;
  value: jest.Mock<Mission, []>;
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
      doc: jest.fn().mockReturnValue(fullMission),
      whenReady: jest.fn().mockResolvedValue(undefined),
      change: jest.fn((changeFn) => {
        changeFn(fullMission);
        return Promise.resolve();
      }),
      on: jest.fn(),
      off: jest.fn(),
      once: jest.fn(),
      value: jest.fn().mockReturnValue(fullMission),
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
    doc: jest.fn().mockReturnValue(generateBlankMission({})),
    whenReady: jest.fn().mockResolvedValue(undefined),
    change: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    value: jest.fn().mockReturnValue(generateBlankMission({})),
  });

  // all the functions for accessing this mocked repo
  return {
    find: jest.fn((url: string) => {
      const handle = mockHandles.get(url);
      return Promise.resolve(handle || createDefaultMockHandle());
    }),
    create: jest.fn((doc: Mission): MockDocHandle => {
      // Generate a unique URL for the new document
      const url = `automerge:${doc.name?.replace(/\s+/g, "") || "NewMission"}`;

      const mockHandle: MockDocHandle = {
        doc: jest.fn().mockReturnValue(doc),
        whenReady: jest.fn().mockResolvedValue(undefined),
        change: jest.fn((changeFn: (doc: Mission) => void) => {
          changeFn(doc);
          return Promise.resolve();
        }),
        on: jest.fn(),
        off: jest.fn(),
        once: jest.fn(),
        value: jest.fn().mockReturnValue(doc),
        url: url,
      };

      // Store the handle so it can be found later
      mockHandles.set(url, mockHandle);

      return mockHandle;
    }),
    delete: jest.fn(),
    handles: Object.fromEntries(mockHandles),
  };
};
