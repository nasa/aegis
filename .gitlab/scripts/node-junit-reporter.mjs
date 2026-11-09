import { JUnitReporter } from "vitest/node";

// Browser jobs publish their own project-qualified JUnit results. Vitest 5
// replays those modules during coverage merging even with the Node config.
export default class NodeJUnitReporter extends JUnitReporter {
  async onTestRunEnd(testModules, unhandledErrors) {
    await super.onTestRunEnd(
      testModules.filter((module) => module.task.pool !== "browser"),
      unhandledErrors
    );
  }
}
