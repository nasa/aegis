/**
 * Vitest setup file - runs before each test file
 */
import { LocalDocHandle } from "historyStore/LocalDocHandle";
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
  const missionSchema = await import("../../../.local/schemas/mission.json");
  const mdauSchema = await import("../../../.local/schemas/mdau.json");
  const missionFieldsSchema = await import("../../../.local/schemas/missionFields.json");
  const ajv = new Ajv({ verbose: true, allowUnionTypes: true, allErrors: true });

  return {
    missionValidator: ajv.compile(missionSchema),
    mdauSchemaValidator: ajv.compile(mdauSchema),
    missionFieldsValidator: ajv.compile(missionFieldsSchema),
  };
});

/**
 * Mock the module that the client files all interact with. The mission handle is a real
 * history-store `LocalDocHandle`, so `change()` runs through the same Immer draft and patch
 * normalization as production, and the document it exposes is frozen like a real one.
 * `setMissionAutomergeDocHandle()` ignores its argument and installs a fresh test mission.
 * `change` is a spy over the real implementation.
 */
vi.mock("client/automergeDocHandles", () => {
  let missionDocHandle: LocalDocHandle<Mission> = null;

  const createMissionDocHandle = () => {
    const handle = new LocalDocHandle<Mission>(
      generateBlankMission({
        name: "Vitest Test Mission",
        landerLocation: { lat: 3, lng: 3 },
        actionTemplates: {
          [uuidv4()]: generateBlankActionTemplate({
            templateName: "Vitest Action Template",
          }),
        },
        actionDefinitions: generateDefaultActionDefinitions(),
      }),
      "local:vitest-mission"
    );
    // Spy so tests can count change() calls; the real change still runs.
    vi.spyOn(handle, "change");
    return handle;
  };

  return {
    getMissionDocHandle: vi.fn(() => missionDocHandle),
    setMissionAutomergeDocHandle: vi.fn(() => {
      missionDocHandle = createMissionDocHandle();
      return missionDocHandle;
    }),
    withMissionChange: vi.fn((fn: (m: Mission) => unknown) => {
      if (!missionDocHandle) return undefined;
      let result: unknown;
      missionDocHandle.change((m) => {
        result = fn(m);
      });
      return result;
    }),
    withMissionOp: vi.fn(
      (op: (handle: DocHandle<Mission>, ...args: unknown[]) => unknown, ...args: unknown[]) =>
        missionDocHandle ? op(missionDocHandle, ...args) : undefined
    ),
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
