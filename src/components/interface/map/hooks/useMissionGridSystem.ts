import { useMemo } from "react";

import { refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { resolveMissionGridSystem } from "utils/lgrs/system";

/** The mission's grid system in the active label scheme (one instance per `system.key`). */
export function useMissionGridSystem(): LgrsGridSystem {
  return useMemo(() => resolveMissionGridSystem({}), []);
}

/**
 * The system for grid coordinates and grid-north bearings: the mission's grid system when it
 * shows grid coordinates (`usingLGRSCoordinates`), otherwise null.
 */
export function useMissionCoordinateSystem(): LgrsGridSystem | null {
  const usingLGRSCoordinates = useMissionDocSelector((m) => m.usingLGRSCoordinates, refEqual);
  const system = useMissionGridSystem();
  return usingLGRSCoordinates ? system : null;
}
