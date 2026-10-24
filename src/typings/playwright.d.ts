type BehavioralScenario = "planning" | "execution";

type BehavioralMissionIds = typeof import("../tests/playwright/fixtures/missionSeed").MISSION_IDS;

interface BehavioralMission {
  id: number;
  name: string;
  url: string;
  dashboardUrl: string;
  docUrl: string;
  ids: BehavioralMissionIds;
  open(page: import("@playwright/test").Page): Promise<void>;
  read(): Promise<Mission>;
  /** Setup only; exercise the behavior under test through its real user interface. */
  change(mutator: (mission: Mission) => void): Promise<void>;
}

interface BehavioralFixtures {
  scenario: BehavioralScenario;
  mission: BehavioralMission;
}

interface BehavioralPlanningExport {
  stations: ExportStation[];
  pois: ExportPOI[];
  evas: ExportEva[];
}
