/**
 * Vitest setup file - runs before each test file
 */
import * as Automerge from "@automerge/automerge";
import {
  generateBlankActionTemplate,
  generateBlankMission,
  generateDefaultActionDefinitions,
} from "../../store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";

vi.mock("box-node-sdk", () => ({
  getPreconfiguredInstance: () => vi.fn(),
}));

// Mock schema validators to avoid file system reads which will fail in tests
vi.mock("utils/validateSchemaServer", async () => {
  const Ajv = (await import("ajv")).default;
  const rexOverwriteSchema = await import("../../../.local/schemas/rexOverwrite.json");
  const missionSchema = await import("../../../.local/schemas/mission.json");
  const missionFieldsSchema = await import("../../../.local/schemas/missionFields.json");
  const ajv = new Ajv({ verbose: true, allowUnionTypes: true, allErrors: true });

  return {
    rexOverwriteSchemaValidator: ajv.compile(rexOverwriteSchema),
    missionValidator: ajv.compile(missionSchema),
    missionFieldsValidator: ajv.compile(missionFieldsSchema),
  };
});

/**
 * Mock @automerge/automerge-repo for client side testing
 * We need this mock to prevent any module initialization side effects at loading
 * time due to imports.
 *
 * Note: server side mocking of automerge is performed in src/tests/vitest/helpers/mockAutomergeRepo
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

/**
 * Mock the module that the client files all interact with.
 * Setup mock such that doc() and change() use the real automerge.
 * @automerge/automerge CRDT engine (pure in-memory, no I/O). This is
 * intentional to expose two bug classes that the real engine would surface:
 *
 *   1. Proxy-reference errors — assigning a live Automerge proxy ref inside
 *      a .change() callback throws "cannot create a reference to an existing
 *      document" in production but passes silently with cloneDeep.
 *
 *   2. List-reassignment vs splice — filter-reassigning an array inside
 *      .change() produces the same plain-JS end-state as splice but loses
 *      per-element CRDT identity. The real engine records distinct change
 *      operations, making the difference observable.
 */
vi.mock("client/automergeDocHandles", () => {
  let mockAutomergeDocHandles: DocHandle<Mission> = null;

  function createMockDocHandle() {
    let currentDoc = Automerge.from(
      generateBlankMission({
        name: "Vitest Test Mission",
        landerLocation: { lat: 3, lng: 3 },
        actionTemplates: {
          [uuidv4()]: generateBlankActionTemplate({
            templateName: "Vitest Action Template",
          }),
        },
        actionDefinitions: generateDefaultActionDefinitions(),
      }) as unknown as Record<string, unknown>
    ) as unknown as Mission;

    return {
      doc: vi.fn().mockImplementation(() => currentDoc),
      change: vi.fn().mockImplementation((changeFn) => {
        currentDoc = Automerge.change(currentDoc, changeFn);
      }),
      value: vi.fn().mockImplementation(() => currentDoc),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      whenReady: vi.fn().mockResolvedValue(undefined),
    };
  }

  return {
    getMissionDocHandle: vi.fn(() => mockAutomergeDocHandles),
    setMissionAutomergeDocHandle: vi.fn(() => {
      const mockDocHandle = createMockDocHandle();
      mockAutomergeDocHandles = mockDocHandle as unknown as DocHandle<Mission>;
      return mockDocHandle;
    }),
    withMissionChange: vi.fn((fn: (m: Mission) => unknown) => {
      if (!mockAutomergeDocHandles) return undefined;
      let result: unknown;
      mockAutomergeDocHandles.change((m) => {
        result = fn(m);
      });
      return result;
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
