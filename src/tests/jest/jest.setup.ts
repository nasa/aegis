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

// Add TextEncoder/TextDecoder global setup
// Text encoder isn't defined in jest and causes Login call to fail
// Import it here for all tests to use
// https://stackoverflow.com/questions/68468203/why-am-i-getting-textencoder-is-not-defined-in-jest
import { TextEncoder, TextDecoder } from "util";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.TextEncoder = TextEncoder as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.TextDecoder = TextDecoder as any;

export {};
