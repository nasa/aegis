import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReportActionTitle from "components/panes/reports/shared/report-action-title";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankAction } from "store/storeUtils/action";

describe("ReportActionTitle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const renderTitle = (action: Action, mission: Mission) => {
    act(() => {
      root.render(<ReportActionTitle action={action} mission={mission} />);
    });
  };

  const badge = () => container.querySelector('[aria-label^="Mission priority:"]');

  const buildV2Mission = () => {
    const mission = generateBlankMission({ actionSystemVersion: 2 });
    mission.missionPriorities = {
      p2: { trace: "SIMD-0002.1", category: "Sample Collection" },
    };
    return mission;
  };

  it("shows the priority badge on a non-STM v2 action with an explicit missionPriorityUuid", () => {
    const mission = buildV2Mission();
    const action = generateBlankAction({
      uuid: "a1",
      stmAction: false,
      name: "Deploy instrument",
      missionPriorityUuid: "p2",
    });

    renderTitle(action, mission);
    expect(container.textContent).toContain("Deploy instrument");
    expect(badge()).not.toBeNull();
    expect(badge()!.textContent).toBe("SIMD-0002.1");
  });

  it("shows the badge on STM actions and hides only the legacy priority adjective", () => {
    const mission = buildV2Mission();
    mission.actionDefinitions = {
      verbs: { v1: { name: "Collect", abbr: "c" } },
      nouns: { n1: { name: "Core", abbr: "co" } },
      adjectives: {
        adjPri: { name: "Pri: simd-0002.1", abbr: "p" },
        adjRed: { name: "Red", abbr: "r" },
      },
    };
    const action = generateBlankAction({
      uuid: "a3",
      stmAction: true,
      name: "",
      missionPriorityUuid: null,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "adjPri" },
    });

    renderTitle(action, mission);
    expect(container.textContent).toContain("Collect");
    expect(container.textContent).toContain("Core");
    // The raw adjective would duplicate the trace badge, so it is hidden
    expect(container.textContent).not.toContain("Pri: simd-0002.1");
    expect(badge()!.textContent).toBe("SIMD-0002.1");

    renderTitle(
      {
        ...action,
        missionPriorityUuid: "p2",
        actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "adjRed" },
      },
      mission
    );
    expect(container.textContent).toContain("Red");
    expect(badge()!.textContent).toBe("SIMD-0002.1");
  });

  it("renders a plain name with no badge on a v1 mission even when missionPriorityUuid is set", () => {
    const mission = generateBlankMission({ actionSystemVersion: 1 });
    mission.missionPriorities = {
      p2: { trace: "SIMD-0002.1", category: "Sample Collection" },
    };
    const action = generateBlankAction({
      uuid: "a4",
      stmAction: true,
      name: "Legacy action",
      missionPriorityUuid: "p2",
    });

    renderTitle(action, mission);
    expect(container.textContent).toBe("Legacy action");
    expect(badge()).toBeNull();
  });
});
