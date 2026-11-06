declare global {
  interface BrowserDownload {
    filename: string;
    blob: Blob;
    text(): Promise<string>;
  }

  type BrowserRequestHandler = (url: URL, init: RequestInit) => Response | Promise<Response>;

  interface BrowserMission {
    id: number;
    name: string;
    ids: BehavioralMissionIds;
    open(): Promise<void>;
    openDashboard(): Promise<void>;
    captureDownload(action: () => Promise<void>): Promise<BrowserDownload>;
    read(): Promise<Mission>;
    change(mutator: (mission: Mission) => void): Promise<void>;
  }

  interface BrowserMissionFixtures {
    page: import("vitest/browser").BrowserPage;
    scenario: BehavioralScenario;
    requestHandlers: Record<string, BrowserRequestHandler>;
    mission: BrowserMission;
  }
}

declare module "vitest/browser" {
  interface LocatorSelectors {
    getBySelector(selector: string): import("vitest/browser").Locator;
  }
}

export {};
