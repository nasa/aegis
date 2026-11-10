import type { FunctionComponent } from "react";
import styles from "./map-menu-assets.module.css";
import { PathColorPickerMenu } from "components/interface/form/globalFields";
import { LastEditedNumeric } from "components/interface/_global-elements";
import { shallowEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import { formatCoordinateEntry, formatLatLng } from "utils/coordinateEntry";
import { hhmmssFromSeconds } from "utils/formatting";

export const AssetPetSource: FunctionComponent<{ rexUuid: Asset["rexUuid"] }> = ({ rexUuid }) => {
  const source = useMissionDocSelector((m) => {
    const rex = rexUuid ? m.rexes?.[rexUuid] : null;
    const eva = rex ? m.evas?.[rex.evaUuid] : null;
    return {
      eva: eva ? getAsPlannedEvaFromRefUuid(m, eva.refUuid)?.name : null,
      rex: rex?.name || rexUuid,
    };
  }, shallowEqual);
  return (
    <>
      <span className={styles.fieldLabel}>EVA/REX</span>
      <div className={styles.petSourceNames}>
        <span
          className={styles.evaName}
          data-testid="asset-editor-eva"
          title={source.eva || undefined}
        >
          {source.eva || "—"}
        </span>
        <span>/</span>
        <span
          className={styles.rexName}
          data-testid="asset-editor-rex"
          title={source.rex || undefined}
        >
          {source.rex || "—"}
        </span>
      </div>
    </>
  );
};

/** Live saved values shown when the asset has no open edit session. */
export const AssetDetails: FunctionComponent<{
  asset: Asset;
  coordinateContext: CoordinateEntryContext;
}> = ({ asset, coordinateContext }) => {
  const formattedPet = asset.petSeconds === null ? "" : hhmmssFromSeconds(asset.petSeconds);
  const formattedLocation = formatCoordinateEntry(asset.location, coordinateContext);
  return (
    <div className={`${styles.editor} ${styles.editorView}`} data-testid="asset-editor">
      <div className={styles.editorForm}>
        <span className={styles.fieldLabel}>Radius (m)</span>
        <div className={styles.fieldControls}>
          <div data-testid="asset-editor-uncertainty">
            <span aria-label="Radius in meters">{asset.uncertaintyMeters}</span>
          </div>
          <span className={`${styles.fieldLabel} ${styles.inlineFieldLabel}`}>Radius color</span>
          <div data-testid="asset-editor-color">
            <PathColorPickerMenu
              circular={true}
              currentColor={asset.color}
              editMode={false}
              updateColor={() => undefined}
            />
          </div>
        </div>
        <span className={styles.fieldLabel}>Position</span>
        <div className={styles.fieldControls} data-testid="asset-editor-coordinates">
          <span aria-label="Asset coordinates">
            {asset.location ? formattedLocation : "Not placed"}
          </span>
        </div>
        {asset.location && (
          <div className={`${styles.fieldNote} ${styles.fieldValueColumn}`}>
            {coordinateContext.usingLGRSCoordinates && <span>{formatLatLng(asset.location)}</span>}
            <span data-testid="asset-editor-elevation">
              Elev. {asset.elevation !== null ? `${asset.elevation.toFixed(1)} m` : "\u2014"}
            </span>
          </div>
        )}
        <AssetPetSource rexUuid={asset.rexUuid} />
        <span className={styles.fieldLabel}>PET</span>
        <span aria-label="Asset PET" data-testid="asset-editor-pet">
          {formattedPet || "\u2014"}
        </span>
        <span className={`${styles.fieldLabel} ${styles.notesLabel}`}>Notes</span>
        <div className={styles.viewNotes} data-testid="asset-editor-notes">
          <div aria-label="Asset notes">{asset.notes || ""}</div>
        </div>
        <div className={styles.editorLastModified} data-testid="asset-editor-last-modified">
          <span className={styles.fieldLabel}>Last Edited:</span>
          <LastEditedNumeric
            updatedAt={asset.updatedAt}
            createdAt={asset.createdAt}
            info={[["Asset UUID", asset.uuid]]}
          />
        </div>
      </div>
    </div>
  );
};
