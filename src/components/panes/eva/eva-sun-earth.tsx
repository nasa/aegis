import { faSun } from "@fortawesome/free-solid-svg-icons";
import { SubpanelHeading } from "components/interface/_global-elements";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { validators } from "components/interface/form/formValidators";
import { AzimuthIndicator } from "components/interface/map/overlays/map-sunearth";
import { useSunEarthAzimuths } from "components/interface/map/hooks/useSunEarthAzimuths";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateEvaByField } from "operations/apply/apply-eva";
import { useMissionDocSelector } from "utils/useDocSelector";
import { refEqual } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./eva-sun-earth.module.css";

export default function EvaSunEarth({
  eva,
  editMode,
}: {
  eva: Eva;
  editMode: boolean;
}): JSX.Element {
  const azimuths = useSunEarthAzimuths();
  const planetRadius = useMissionDocSelector((m) => m.planetRadius, refEqual);
  const secondaryBodyLabel = planetRadius === 1737400 ? "Earth" : "Moon";
  const fromDate = eva.sunEarthFromDate;
  const update = <K extends keyof Eva>(fieldName: K, value: Eva[K]) =>
    withMissionChange((m) => applyUpdateEvaByField(m, { evaUuid: eva.uuid, fieldName, value }));
  return (
    <div className={paneStyles.panelSection}>
      <div className={paneStyles.panelSectionTitle}>
        <SubpanelHeading icon={faSun}>Sun/{secondaryBodyLabel} Directions</SubpanelHeading>
      </div>
      {editMode ? (
        <div
          className={styles.mode}
          role="radiogroup"
          aria-label={`Sun/${secondaryBodyLabel} direction mode`}
        >
          <label>
            <input
              type="radio"
              name={`sunEarthMode-${eva.uuid}`}
              checked={fromDate}
              onChange={() => update("sunEarthFromDate", true)}
            />{" "}
            Calculate
          </label>
          <label>
            <input
              type="radio"
              name={`sunEarthMode-${eva.uuid}`}
              checked={!fromDate}
              onChange={() => update("sunEarthFromDate", false)}
            />{" "}
            Set manually
          </label>
        </div>
      ) : (
        <div className={styles.mode}>
          {fromDate ? "Calculated from EVA Date/Time" : "Manually set"}
        </div>
      )}
      {planetRadius !== 1737400 ? (
        <div className={styles.note}>
          Calculated values are unavailable because this mission is not on the Moon.
        </div>
      ) : (
        azimuths.warning && <div className={styles.note}>{azimuths.warning}</div>
      )}
      <div className={styles.directions}>
        {(["sun", "earth"] as const).map((body) => {
          const field = body === "sun" ? "sunAzimuth" : "earthAzimuth";
          const label = body === "sun" ? "Sun" : secondaryBodyLabel;
          return (
            <div className={styles.direction} key={body}>
              <div className={styles.indicator}>
                <AzimuthIndicator
                  sunEarth={body}
                  azimuth={azimuths.available ? azimuths[field] : null}
                  dashboard={false}
                />
              </div>
              <div>
                <div className={paneStyles.inputFieldLabel}>{label}</div>
                {!fromDate && (
                  <div className={paneStyles.inputFieldValue}>
                    <ValidatedInputField
                      key={`${eva.uuid}-${field}`}
                      value={String(eva[field])}
                      displayValue={`${eva[field]}\u00b0`}
                      editMode={editMode}
                      fieldProps={{
                        name: field,
                        ariaLabel: `${label} azimuth`,
                        validators: [
                          validators.required,
                          validators.mustBeNumber,
                          validators.minValue(0),
                          validators.maxValue(360),
                        ],
                      }}
                      styleContainer={{ minWidth: "65px" }}
                      onSubmit={(value) => update(field, Number(value) % 360)}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
