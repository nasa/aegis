/**
 * Vitest setup file - runs before each test file
 */
import cloneDeep from "lodash/cloneDeep";
import {
  generateBlankActionTemplate,
  generateBlankMission,
  generateDefaultActionDefinitions,
} from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";

vi.mock("box-node-sdk", () => ({
  getPreconfiguredInstance: () => vi.fn(),
}));

// Mock schema validators to avoid file system reads which will fail in tests
vi.mock("utils/validateSchemaServer", async () => {
  const Ajv = (await import("ajv")).default;
  const rexOverwriteSchema = await import("../../../.local/schemas/rexOverwrite.json");
  const missionSchema = await import("../../../.local/schemas/mission.json");
  const ajv = new Ajv({ verbose: true, allowUnionTypes: true, allErrors: true });

  return {
    rexOverwriteSchemaValidator: ajv.compile(rexOverwriteSchema),
    missionValidator: ajv.compile(missionSchema),
  };
});

/**
 * Mock @automerge/automerge-repo for client side testing
 */
vi.mock("@automerge/automerge-repo", () => {
  class MockDocHandle {
    doc() {
      return {};
    }
    change() {
      return Promise.resolve();
    }
    value() {
      return {};
    }
    on() {}
    off() {}
    once() {}
    whenReady() {
      return Promise.resolve();
    }
  }

  return {
    DocHandle: MockDocHandle,
    Repo: vi.fn().mockImplementation(() => ({
      create: vi.fn(),
      find: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    })),
  };
});

vi.mock("client/automergeDocHandles", () => {
  // Inline MockDocHandle (same as the @automerge/automerge-repo mock)
  class MockDocHandle {
    doc() {
      return {};
    }
    change() {
      return Promise.resolve();
    }
    value() {
      return {};
    }
    on() {}
    off() {}
    once() {}
    whenReady() {
      return Promise.resolve();
    }
  }

  const mockAutomergeDocHandles: AutomergeDocHandles = {
    mission: null,
  };

  function createMockDocHandle() {
    const mockDocHandle = new MockDocHandle();
    let currentDoc = generateBlankMission({
      name: "Vitest Test Mission",
      landerLocation: { lat: 3, lng: 3 },
      actionTemplates: {
        [uuidv4()]: generateBlankActionTemplate({
          templateName: "Vitest Action Template",
        }),
      },
      actionDefinitions: generateDefaultActionDefinitions(),
    });

    mockDocHandle.doc = vi.fn().mockImplementation(() => currentDoc);

    mockDocHandle.change = vi.fn().mockImplementation((changeFn) => {
      const docCopy = cloneDeep(currentDoc);
      changeFn(docCopy);
      currentDoc = docCopy;
      return;
    });

    return mockDocHandle;
  }

  return {
    getAutomergeDocHandles: vi.fn(() => mockAutomergeDocHandles),
    setMissionAutomergeDocHandle: vi.fn(() => {
      const mockDocHandle = createMockDocHandle();
      mockAutomergeDocHandles.mission = mockDocHandle as unknown as DocHandle<Mission>;
      return mockDocHandle;
    }),
  };
});

/**
 * Suppress console messages starting with "[@emss/logger]"
 */
const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
consoleMethods.forEach((method) => {
  const originalMethod = console[method];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console[method] = (...args: any[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[@emss/logger]")) {
      return;
    }
    originalMethod.apply(console, args);
  };
});

/**
 * Custom matchers for the vitest testing framework.
 */
expect.extend({
  toHappenAround(x: Date, y: Date, z: string) {
    const received = x.getTime();
    const expected = y.getTime();
    return {
      pass: Math.abs(received / 1000 - expected / 1000) < 1,
      message: () => `Received time ${x} is not within 1 second of ${y}${z ? ` ${z}` : ""}`,
    };
  },
});

export {};
