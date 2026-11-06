import { useMemo } from "react";
import { refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { resolveMissionGridSystem } from "utils/lgrs/system";

/**
 * The planet's grid system in the mission's label scheme. Grid systems are cached instances,
 * so there is one instance per `system.key`.
 */
export function useMissionGridSystem(): LgrsGridSystem | null {
  const planet = useMissionDocSelector((m) => m.planet, refEqual);
  const earthGridLabelScheme = useMissionDocSelector((m) => m.earthGridLabelScheme, refEqual);
  return useMemo(
    () => resolveMissionGridSystem({ planet, earthGridLabelScheme }),
    [planet, earthGridLabelScheme]
  );
}

/** Uploaded Earth grids use their coordinate lattice and true-north bearings. */
export function useMissionCoordinateSystem(): LgrsGridSystem | null {
  const system = useMissionGridSystem();
  const hasUploadedGrid = useMissionDocSelector((m) => !!m.serverFileGrid, refEqual);
  return system?.id === "earth-wgs84" && hasUploadedGrid ? null : system;
}
