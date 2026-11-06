declare global {
  interface BrowserMission {
    id: number;
    name: string;
    ids: BehavioralMissionIds;
    open(): Promise<void>;
    read(): Promise<Mission>;
    change(mutator: (mission: Mission) => void): Promise<void>;
  }

  interface BrowserMissionFixtures {
    page: import("vitest/browser").BrowserPage;
    scenario: BehavioralScenario;
    mission: BrowserMission;
  }
}

declare module "vitest/browser" {
  interface LocatorSelectors {
    getBySelector(selector: string): import("vitest/browser").Locator;
  }
}

export {};
