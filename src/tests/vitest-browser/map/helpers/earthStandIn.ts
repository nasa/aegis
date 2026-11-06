import { moonGridSystem } from "utils/lgrs/moon/system";
import type * as SystemModule from "utils/lgrs/system";

/**
 * `utils/lgrs/system` for `vi.mock`, with a stand-in for `earth-wgs84`: lunar geometry and
 * labels under the Earth id and the requested scheme. Scheme selection stays real. For tests
 * of what reads only a system's id and scheme (indicators, toggles).
 */
export function withEarthStandIn(actual: typeof SystemModule): typeof SystemModule {
  const standIns = new Map<GridLabelScheme, LgrsGridSystem>();
  const getEarthStandIn = (scheme: GridLabelScheme): LgrsGridSystem => {
    let system = standIns.get(scheme);
    if (!system) {
      system = { ...moonGridSystem, key: `earth-wgs84/${scheme}`, id: "earth-wgs84", scheme };
      standIns.set(scheme, system);
    }
    return system;
  };
  return {
    ...actual,
    getGridSystem: (id, scheme) =>
      id === "earth-wgs84" ? getEarthStandIn(scheme) : actual.getGridSystem(id, scheme),
    resolveMissionGridSystem: (mission, userSchemeOverride) =>
      actual.getMissionGridSystemId(mission) === "earth-wgs84"
        ? getEarthStandIn(actual.getMissionLabelScheme(mission, userSchemeOverride))
        : actual.resolveMissionGridSystem(mission, userSchemeOverride),
  };
}
