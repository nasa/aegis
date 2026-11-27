/**
 * A skipped REX sequence row in the left panel keeps the skipped checkbox icon
 * and strike-through name, on the same grey background as a complete row,
 * even when Maestro reports both crews at 100%.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SequenceItemTraverse from "components/panes/eva/eva-item-sequence-traverse";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";
import type * as UseAppSelectorModule from "utils/useAppSelector";
import "styles/globals.css";

const fixture = vi.hoisted(() => ({ mission: null as Mission | null }));

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: (selector: (mission: Mission | null) => unknown) =>
    selector(fixture.mission),
}));

vi.mock("utils/useAppSelector", async (importOriginal) => {
  const actual = await importOriginal<typeof UseAppSelectorModule>();
  const state = {
    terrainProfiles: { previews: {}, profiles: {} },
    user: { missionPerms: { permissions: { edit: false } } },
    eva: { selectedEvaSequenceItemUuid: null as string | null },
    hover: { leftPanelHoverItemUuid: null as string | null },
  };
  return {
    ...actual,
    useAppSelector: (selector: (s: typeof state) => unknown) => selector(state),
  };
});

vi.mock("utils/useAppDispatch", () => ({ useAppDispatch: () => vi.fn() }));

const EVA_UUID = "eva-1";
const TRAVERSE_UUID = "traverse-1";

let harness: ReactHarness;

const makeMission = (entry: ActivityEntry): Mission =>
  ({
    traverseRate: 1,
    traverses: { [TRAVERSE_UUID]: { uuid: TRAVERSE_UUID, name: "A to B", duration: 10 } },
    evas: { [EVA_UUID]: { uuid: EVA_UUID, sequence: [], traverseRate: null } },
    actions: {},
    rexes: {
      "rex-1": {
        uuid: "rex-1",
        evaUuid: EVA_UUID,
        isRunning: true,
        maestroControlled: true,
        traverseEntries: { [TRAVERSE_UUID]: entry },
      },
    },
  }) as unknown as Mission;

const renderRow = (entry: ActivityEntry) => {
  fixture.mission = makeMission(entry);
  harness.render(
    <SequenceItemTraverse evaUuid={EVA_UUID} traverseUuid={TRAVERSE_UUID} isRexRunning={true} />
  );
  const row = harness.container.querySelector<HTMLElement>("[class*='evaItem']")!;
  const name = harness.container.querySelector<HTMLElement>("[class*='evaItemName']")!;
  const statusIcon = harness.container.querySelector<SVGElement>(
    "[class*='rexStatusWrapper'] svg"
  )!;
  return {
    background: getComputedStyle(row).backgroundColor,
    textDecoration: getComputedStyle(name).textDecorationLine,
    isFontAwesomeIcon: statusIcon.classList.contains("svg-inline--fa"),
  };
};

beforeEach(() => {
  harness = createReactHarness();
});

afterEach(() => harness.unmount());

describe("left panel REX sequence row status style", () => {
  it("shows the skipped icon and strike-through on the complete grey background", () => {
    const complete = renderRow({ rexStatus: "complete" });
    harness.unmount();
    harness = createReactHarness();

    const skipped = renderRow({
      rexStatus: "skipped",
      maestroPercentCompleteEv1: 100,
      maestroPercentCompleteEv2: 100,
    });

    expect(skipped.isFontAwesomeIcon).toBe(false);
    expect(skipped.textDecoration).toBe("line-through");
    expect(complete.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(skipped.background).toBe(complete.background);
    expect(complete.textDecoration).toBe("none");
    expect(complete.isFontAwesomeIcon).toBe(true);
  });
});
