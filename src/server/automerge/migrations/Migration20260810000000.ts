import type { AutomergeMigration } from "server/automerge/migrations/types";

export const Migration20260810000000: AutomergeMigration = {
  version: 20260810000000,
  name: "rename-station-label-stroke-to-halo",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const station of Object.values(mission.stations)) {
        for (const control of Object.values(station.mapCircleControls)) {
          const style = control.style as MapSublayerStyle & {
            labelStrokeColor?: string;
            labelStrokeWidth?: number;
            labelStrokeOpacity?: number;
          };
          if ("labelStrokeColor" in style) {
            if (style.labelHaloColor === undefined) style.labelHaloColor = style.labelStrokeColor;
            delete style.labelStrokeColor;
          }
          if ("labelStrokeWidth" in style) {
            if (style.labelHaloWidth === undefined) style.labelHaloWidth = style.labelStrokeWidth;
            delete style.labelStrokeWidth;
          }
          if ("labelStrokeOpacity" in style) {
            if (style.labelHaloOpacity === undefined) {
              style.labelHaloOpacity = style.labelStrokeOpacity;
            }
            delete style.labelStrokeOpacity;
          }
        }
      }
    });
  },
};
