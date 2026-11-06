import { useMemo } from "react";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { resolveMissionGridSystem } from "utils/lgrs/system";

/** The planet's grid system with the user's Earth label preference applied. */
export function useMissionGridSystem(): LgrsGridSystem | null {
  const planet = useMissionDocSelector((m) => m.planet, refEqual);
  const earthGridLabelScheme = useMissionDocSelector((m) => m.earthGridLabelScheme, refEqual);
  const userSchemeOverride = useAppSelector(
    (state) => state.interface.gridLabelSchemeOverride,
    refEqual
  );
  return useMemo(
    () => resolveMissionGridSystem({ planet, earthGridLabelScheme }, userSchemeOverride),
    [planet, earthGridLabelScheme, userSchemeOverride]
  );
}

/** Uploaded Earth grids use their coordinate lattice and true-north bearings. */
export function useMissionCoordinateSystem(): LgrsGridSystem | null {
  const system = useMissionGridSystem();
  const hasUploadedGrid = useMissionDocSelector((m) => !!m.serverFileGrid, refEqual);
  return system?.id === "earth-wgs84" && hasUploadedGrid ? null : system;
}
