const config = {
  preset: "ts-jest/presets/js-with-ts",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "node"],
  moduleDirectories: ["node_modules", "src"],
  rootDir: "../../../src",
  moduleNameMapper: {
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/tests/__mocks__/fileMock.js",
    "\\.(css|scss)$": "identity-obj-proxy",
    "^__mocks__(.*)$": "<rootDir>/__mocks__$1",
    "^components/(.*)$": "<rootDir>/components/$1",
    "^http-client/(.*)$": "<rootDir>/http-client/$1",
    "^pages/(.*)$": "<rootDir>/pages/$1",
    "^public/(.*)$": "<rootDir>/public/$1",
    "^server/(.*)$": "<rootDir>/server/$1",
    "^store/(.*)$": "<rootDir>/store/$1",
    "^tests/(.*)$": "<rootDir>/tests/$1",
    "^typings$": "<rootDir>/typings/index.d",
    "^typings/(.*)$": "<rootDir>/typings/$1",
    "^utils/(.*)$": "<rootDir>/utils/$1",
    "^.+\\.(css|sass|scss)$": "<rootDir>/__mocks__/styleMock.js",
  },
  collectCoverageFrom: [
    "<rootDir>/**/*.{js,jsx,ts,tsx}",
    "!**/node_modules/**",
    "!**/*.d.ts",
    "!<rootDir>/tests/**",
    "!<rootDir>/server/database/**",
    "!**/coverage/**",
  ],
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  // coverageThreshold: {
  //   global: {
  //     lines: 90,
  // }, },
  coverageReporters: ["text", "lcov", "cobertura"],
  globalSetup: "<rootDir>/tests/jest/jest.globalSetup.ts",
  globalTeardown: "<rootDir>/tests/jest/jest.globalTeardown.ts",
  setupFiles: ["<rootDir>/tests/jest/jest.setup.ts", "dotenv/config"],
  setupFilesAfterEnv: ["<rootDir>/tests/jest/jest-extends.ts"],
  testPathIgnorePatterns: [
    "<rootDir>/tests/playwright/", // ignore playwright tests, we only want to run jest tests
  ],
  globals: {
    window: {},
    document: {},
  },
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "tsconfig.jest.json", warnOnly: true }],
  },
  testEnvironment: "jest-environment-jsdom",
  testTimeout: 10000, // increase timeout threshold for all tests
};

export default config;
