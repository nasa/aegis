/**
 * Mock up files that jest can't seem to parse. Jest will return this error
 * "Jest failed to parse a file. This happens e.g. when your code or its dependencies use non-standard
 *  JavaScript syntax, or when Jest is not configured to support such syntax."
 */

// jest will fail to parse any file that imports a function from utils/export.ts,
//    since export.ts imports from the library "string-strip-html". Mock the module here.
jest.mock("string-strip-html", () => ({
  stripHtml: () => jest.fn(),
}));

jest.mock("box-node-sdk", () => ({
  getPreconfiguredInstance: () => jest.fn(),
}));

jest.mock("box-node-sdk/lib/box-client", () => ({
  Files: {
    getReadStream: () => jest.fn(),
  },
}));

export {};
