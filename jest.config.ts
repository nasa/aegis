import nextJest from "next/jest";

const createJestConfig = nextJest({
  // Your Next.js config
  dir: "./",
});

const config = {
  preset: "ts-jest/presets/js-with-ts",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "node"],
  moduleDirectories: ["node_modules", "src"],
  moduleNameMapper: {
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/tests/__mocks__/fileMock.js",
    "\\.(css|scss)$": "identity-obj-proxy",
    "^__mocks__(.*)$": "<rootDir>/__mocks__$1",
    "^client/(.*)$": "<rootDir>/client/$1",
    "^components/(.*)$": "<rootDir>/components/$1",
    "^http-client/(.*)$": "<rootDir>/http-client/$1",
    "^pages/(.*)$": "<rootDir>/pages/$1",
    "^public/(.*)$": "<rootDir>/public/$1",
    "^server/(.*)$": "<rootDir>/server/$1",
    "^services/(.*)$": "<rootDir>/services/$1",
    "^store/(.*)$": "<rootDir>/store/$1",
    "^typings$": "<rootDir>/typings/index.d",
    "^typings/(.*)$": "<rootDir>/typings/$1",
    "^utils/(.*)$": "<rootDir>/utils/$1",
    "^.+\\.(css|sass|scss)$": "<rootDir>/__mocks__/styleMock.js",
  },
  collectCoverageFrom: [
    "**/*.{js,jsx,ts,tsx}",
    "!**/*.d.ts",
    "!jest.config.ts",
    "!next.config.js",
    "!**/node_modules/**",
    "!<rootDir>/out/**",
    "!<rootDir>/.next/**",
    "!<rootDir>/http-client/**",
    "!<rootDir>/pages/**",
    "!<rootDir>/components/**",
    "!<rootDir>/.idea/**",
    "!**/.cache/**",
    "!**/.vscode/**",
    "!**/coverage/**",
    "!**/dist/**",
    "!**/out/**",
    "!server/database/migrations/*.ts",
    "!server/database/seeds/**/*.ts",
  ],
  // coverageThreshold: {
  //   global: {
  //     lines: 90,
  // }, },
  coverageReporters: ["text", "lcov", "cobertura"],
  globalSetup: "<rootDir>/jest.globalSetup.ts",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  setupFilesAfterEnv: ["<rootDir>/utils/jest-extends.ts"],
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/", "<rootDir>/out"],
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.jest.json",
      // https://huafu.github.io/ts-jest/user/config/diagnostics#examples
      // TODO: turn this on after js->ts conversion is complete
      diagnostics: false,
    },
    window: {},
    document: {},
  },
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  testEnvironment: "jest-environment-jsdom",
};

export default createJestConfig(config);
