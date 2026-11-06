import type { CSSProperties, FunctionComponent } from "react";
import styles from "./map-menu-assets.module.css";
import {
  ValidatedInputField,
  ValidatedTextArea,
} from "components/interface/form/globalFieldsAutomerge";
import { PathColorPickerMenu } from "components/interface/form/globalFields";
import { LastEditedNumeric } from "components/interface/_global-elements";
import { shallowEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import { formatCoordinateEntry, formatLatLng } from "utils/coordinateEntry";
import { hhmmssFromSeconds } from "utils/formatting";

const compactFieldStyle: CSSProperties = { padding: 0, minWidth: 0 };

export const AssetPetSource: FunctionComponent<{ petRex: Asset["petRex"] }> = ({ petRex }) => {
  const source = useMissionDocSelector((m) => {
    const rex = petRex ? m.rexes?.[petRex.uuid] : null;
    const eva = rex ? m.evas?.[rex.evaUuid] : null;
    return {
      eva: eva ? getAsPlannedEvaFromRefUuid(m, eva.refUuid)?.name : null,
      rex: rex?.name || petRex?.name || petRex?.uuid,
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
            <ValidatedInputField
              value={String(asset.uncertaintyMeters)}
              fieldProps={{ name: "assetRadius", ariaLabel: "Radius in meters" }}
              editMode={false}
              onSubmit={() => undefined}
              styleContainer={compactFieldStyle}
              displayStyle={{ fontSize: "inherit" }}
            />
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
          <ValidatedInputField
            value={formattedLocation}
            displayValue={asset.location ? formattedLocation : "Not placed"}
            editMode={false}
            onSubmit={() => undefined}
            styleContainer={{ ...compactFieldStyle, flex: "1 1 110px" }}
            displayStyle={{ fontSize: "inherit" }}
            fieldProps={{ name: "assetCoordinates", ariaLabel: "Asset coordinates" }}
          />
        </div>
        {asset.location && (
          <div className={`${styles.fieldNote} ${styles.fieldValueColumn}`}>
            {coordinateContext.usingLGRSCoordinates && <span>{formatLatLng(asset.location)}</span>}
            <span data-testid="asset-editor-elevation">
              Elev. {asset.elevation !== null ? `${asset.elevation.toFixed(1)} m` : "\u2014"}
            </span>
          </div>
        )}
        <AssetPetSource petRex={asset.petRex} />
        <span className={styles.fieldLabel}>PET</span>
        <ValidatedInputField
          value={formattedPet}
          editMode={false}
          onSubmit={() => undefined}
          styleContainer={compactFieldStyle}
          displayStyle={{ fontSize: "inherit" }}
          displayValue={<span data-testid="asset-editor-pet">{formattedPet || "\u2014"}</span>}
          fieldProps={{ name: "assetPet", ariaLabel: "Asset PET" }}
        />
        <span className={`${styles.fieldLabel} ${styles.notesLabel}`}>Notes</span>
        <div className={styles.viewNotes} data-testid="asset-editor-notes">
          <ValidatedTextArea
            value={asset.notes || ""}
            maxRows={6}
            resizable={true}
            editMode={false}
            onSubmit={() => undefined}
            styleContainer={compactFieldStyle}
            fieldProps={{ name: "assetNotes", ariaLabel: "Asset notes" }}
          />
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
