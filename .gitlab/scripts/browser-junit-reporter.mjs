import { JUnitReporter } from "vitest/reporters";

// GitLab deduplicates testcase class/name pairs. Vitest's default JUnit class
// omits the browser project, which would hide Firefox/WebKit parity results.
export default class BrowserJUnitReporter extends JUnitReporter {
  async writeTasks(tasks, filename) {
    for (const task of tasks) {
      const project = task.file?.projectName;
      await super.writeTasks([task], project ? `${project}:${filename}` : filename);
    }
  }
}
