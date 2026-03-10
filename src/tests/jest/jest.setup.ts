import cloneDeep from "lodash/cloneDeep";
import {
  generateBlankActionTemplate,
  generateBlankMission,
  generateDefaultActionDefinitions,
} from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";

/**
 * Mock up files that jest can't seem to parse. Jest will return this error
 * "Jest failed to parse a file. This happens e.g. when your code or its dependencies use non-standard
 *  JavaScript syntax, or when Jest is not configured to support such syntax."
 */
jest.mock("box-node-sdk", () => ({
  getPreconfiguredInstance: () => jest.fn(),
}));

/**
 * Add TextEncoder/TextDecoder global setup
 * Text encoder isn't defined in jest and causes Login call to fail
 * Import it here for all tests to use
 * https://stackoverflow.com/questions/68468203/why-am-i-getting-textencoder-is-not-defined-in-jest
 */
import { TextEncoder, TextDecoder } from "util";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.TextEncoder = TextEncoder as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.TextDecoder = TextDecoder as any;

// Mock schema validators to avoid file system reads which will fail in jest
// Import schemas as JSON modules instead of using fs.readFileSync
jest.mock("utils/validateSchemaServer", () => {
  const Ajv = require("ajv");
  const rexOverwriteSchema = require("../../../.local/schemas/rexOverwrite.json");
  const missionSchema = require("../../../.local/schemas/mission.json");
  const ajv = new Ajv({ verbose: true, allowUnionTypes: true, allErrors: true });

  return {
    rexOverwriteSchemaValidator: ajv.compile(rexOverwriteSchema),
    missionValidator: ajv.compile(missionSchema),
  };
});

/**
 * Mock @automerge/automerge-repo for client side testing
 */
jest.mock("@automerge/automerge-repo", () => {
  // Create a mock DocHandle class with a prototype
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
    Repo: jest.fn().mockImplementation(() => ({
      create: jest.fn(),
      find: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    })),
  };
});

jest.mock("src/client/automergeDocHandles", () => {
  // Import our mocked automerge-repo DocHandle from above
  const { DocHandle } = require("@automerge/automerge-repo");

  const mockAutomergeDocHandles: AutomergeDocHandles = {
    mission: null,
  };

  // Helper function to create a blanket mock of DocHandle with a blank mission
  function createMockDocHandle() {
    const mockDocHandle = new DocHandle();
    let currentDoc = generateBlankMission({
      name: "Jest Test Mission",
      landerLocation: { lat: 3, lng: 3 },
      actionTemplates: {
        [uuidv4()]: generateBlankActionTemplate({
          templateName: "Jest Action Template",
        }),
      },
      actionDefinitions: generateDefaultActionDefinitions(),
    });

    // Override doc() to return the current state synchronously (Automerge v3)
    mockDocHandle.doc = jest.fn().mockImplementation(() => currentDoc);

    // Override change() to mutate the document
    mockDocHandle.change = jest.fn().mockImplementation((changeFn) => {
      // Create a deep copy of the current document to mutate
      const docCopy = cloneDeep(currentDoc);
      changeFn(docCopy); // Apply the changes
      currentDoc = docCopy;
      return;
    });

    return mockDocHandle;
  }

  return {
    // mock the functions
    getAutomergeDocHandles: jest.fn(() => mockAutomergeDocHandles),

    // create a blank mission and set it as the mission doc handle
    setMissionAutomergeDocHandle: jest.fn(() => {
      const mockDocHandle = createMockDocHandle();
      mockAutomergeDocHandles.mission = mockDocHandle;
      return mockDocHandle;
    }),
  };
});

/**
 * Suppress console messages starting with "[@emss/logger]"
 * This is to prevent cluttering the test output with logger messages
 * The @emss/logger package current version will output to the console even if logging is turned off
 * If/when this package is updated to no longer do that, this suppression can be removed
 */
const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
consoleMethods.forEach((method) => {
  const originalMethod = console[method];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console[method] = (...args: any[]) => {
    // Check if the first argument is a string starting with "[@emss/logger]"
    if (typeof args[0] === "string" && args[0].startsWith("[@emss/logger]")) {
      return; // Suppress the message
    }
    // Otherwise, call the original console method
    originalMethod.apply(console, args);
  };
});

export {};
