/**
 * Any global variables that are defined through globalSetup can only be read in globalTeardown.
 *    You cannot retrieve globals defined here in your test suites.
 * https://jestjs.io/docs/configuration#globalsetup-string
 */

// There are also mocked functions in jest.setup.ts

const globalSetup = async (): Promise<void> => {
  console.log(""); // clears the line in the terminal before nextjs prints out messages about which .env files were loaded
};

export default globalSetup;
