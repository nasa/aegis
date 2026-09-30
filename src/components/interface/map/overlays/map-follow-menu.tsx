/**
 * MapFollowMenu — dashboard overlay for auto pan/zoom "follow mode".
 *
 * Renders the "Auto Pan/Zoom Map" toggle and the "Select Items to Follow"
 * multi-select dropdown. Reads/writes the shared follow state from
 * `<FollowModeProvider>`; the headless `FollowMode` behavior consumes the same
 * state to compute the auto-pan/zoom extent.
 *
 * Dashboard only — render inside a `<FollowModeProvider>`.
 */

import type { FunctionComponent } from "react";

import { MultiSelectDropdown } from "components/interface/form/globalFields";
import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useFollowModeContext, useFollowModeSetters } from "../FollowModeProvider";

import styles from "./mapOverlays.module.css";

export const MapFollowMenu: FunctionComponent = () => {
  const { followMode, followModeOptions } = useFollowModeContext();
  const { setFollowMode, setFollowModeOptions } = useFollowModeSetters();

  const posTypes = useMissionDocSelector((m) => {
    const rex = Object.values(m.rexes ?? {}).find((r) => r.isRunning);
    return (rex?.posTypes ?? []).map((pt) => ({ uuid: pt.uuid, name: pt.name }));
  }, deepEqual);

  return (
    <div className={styles.followMenu}>
      <div
        className={styles.followButtonWrapper}
        onClick={(e) => {
          setFollowMode(!followMode);
          e.stopPropagation();
        }}
      >
        <div className={`${styles.followButton} ${followMode && styles.followSelected}`}>
          Auto Pan/Zoom Map
        </div>
      </div>
      <div className={styles.followDropdownWrapper}>
        <MultiSelectDropdown
          items={[
            { label: "Stations", value: "stations" },
            { label: "Traverses", value: "traverses" },
          ].concat(posTypes.map((posType) => ({ label: posType.name, value: posType.uuid })))}
          // selectedItemsValues just takes a string array of values, so pull out
          // all the keys from followModeOptions that have follow turned on.
          selectedItemsValues={Object.keys(followModeOptions).reduce(
            (selectedUuids: string[], uuidKey) => {
              if (followModeOptions[uuidKey].follow) {
                selectedUuids.push(uuidKey);
              }
              return selectedUuids;
            },
            []
          )}
          toggleItem={(itemValue: string) => {
            setFollowModeOptions({
              ...followModeOptions,
              [itemValue]: {
                ...followModeOptions[itemValue],
                follow: !followModeOptions[itemValue].follow,
              },
            });
          }}
          titleLabel="Select Items to Follow"
          containerClassName={styles.followDropdown}
          headerClassName={styles.followDropdownHeader}
        />
      </div>
    </div>
  );
};
