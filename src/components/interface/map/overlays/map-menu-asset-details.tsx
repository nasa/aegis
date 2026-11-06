import type { CSSProperties, FunctionComponent } from "react";
import { useCallback, useEffect, useState } from "react";
import { PickerPopover } from "components/interface/form/PickerPopover";
import { faBan, faCrosshairs, faXmark } from "@fortawesome/free-solid-svg-icons";

import styles from "./map-menu-assets.module.css";
import formStyles from "components/interface/form/globalFieldsAutomerge.module.css";
import {
  ToggleButton,
  ValidatedInputField,
  ValidatedTextArea,
} from "components/interface/form/globalFieldsAutomerge";
import { Button, PathColorPickerMenu } from "components/interface/form/globalFields";
import { filterHHMMSS, validators } from "components/interface/form/formValidators";
import { EmojiPicker, EmojiRenderer } from "components/interface/emojis";
import { LastEditedNumeric } from "components/interface/_global-elements";
import { useMapMenuSetters } from "../MapMenuProvider";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import {
  thunkCancelAssetEdit,
  thunkCancelAssetMapDirective,
  thunkSetAssetEditLocation,
  thunkStartAssetMapDirective,
  thunkUpdateAssetFields,
} from "store/thunk/thunkAsset";
import {
  DEFAULT_ASSET_ICON,
  getAssetFolderUuidByItem,
  getAssetHiddenReason,
  getCurrentAssetPet,
  parseAssetPetSeconds,
  validateAssetName,
  validateAssetNotes,
  validateAssetRadius,
} from "utils/assets";
import { formatCoordinateEntry, formatLatLng, parseCoordinateEntry } from "utils/coordinateEntry";
import { getAccurateNow, hhmmssFromSeconds } from "utils/formatting";

const compactFieldStyle: CSSProperties = { padding: 0, minWidth: 0 };

/** Saved fields stay live; edit mode only enables the individual pencil controls. */
export const AssetDetails: FunctionComponent<{
  asset: Asset;
  inEdit: AssetInEdit | null;
  canEdit: boolean;
  canMutate: boolean;
  coordinateContext: CoordinateEntryContext;
}> = ({ asset, inEdit, canEdit, canMutate, coordinateContext }) => {
  const dispatch = useAppDispatch();
  const { setSubmenuAssets } = useMapMenuSetters();
  const editMode = !!inEdit && canMutate;
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const closeEmojiPicker = useCallback(() => setEmojiAnchor(null), []);
  useEffect(() => {
    if (!editMode) closeEmojiPicker();
  }, [editMode, closeEmojiPicker]);
  const rexes = useMissionDocSelector((m) => m.rexes, refEqual);
  const hasRunningRex = Object.values(rexes ?? {}).some((rex) => rex.isRunning);
  const currentPetAvailable =
    getCurrentAssetPet({ rexes }, getAccurateNow().getTime()).petSeconds !== null;
  const formattedPet = asset.petSeconds === null ? "" : hhmmssFromSeconds(asset.petSeconds);

  const save = (changes: Parameters<typeof thunkUpdateAssetFields>[0]["changes"]) =>
    dispatch(thunkUpdateAssetFields({ assetUuid: asset.uuid, changes }));
  const mapAction = useAppSelector(
    (s) =>
      s.map.mapDirective?.mapItemType === "asset" && s.map.mapDirective.uuid === asset.uuid
        ? s.map.mapDirective.mapAction
        : null,
    refEqual
  );
  const source = useMissionDocSelector((m) => {
    const rex = asset.petRex ? m.rexes?.[asset.petRex.uuid] : null;
    const eva = rex ? m.evas?.[rex.evaUuid] : null;
    const folderUuid = getAssetFolderUuidByItem(Object.values(m.folders ?? {}))[asset.uuid];
    const folder = m.folders?.[folderUuid];
    return {
      eva: eva ? getAsPlannedEvaFromRefUuid(m, eva.refUuid)?.name : null,
      rex: rex?.name || asset.petRex?.name || asset.petRex?.uuid,
      hidden: getAssetHiddenReason(asset, folder),
      folder: folder?.name,
    };
  }, shallowEqual);
  const blocked =
    asset.location && source.hidden
      ? source.hidden === "asset"
        ? "This asset is hidden on the map. Show it in the table to edit its position on the map, or enter coordinates."
        : `This asset's folder "${source.folder}" is hidden on the map. Show the folder to edit its position on the map, or enter coordinates.`
      : undefined;
  const formattedLocation = formatCoordinateEntry(asset.location, coordinateContext);
  return (
    <div
      className={`${styles.editor} ${inEdit ? "" : styles.editorView}`}
      data-testid="asset-editor"
    >
      {canEdit && inEdit && (
        <div className={styles.editorHeader}>
          <div className={styles.editorHeading}>Edit Asset</div>
          <ToggleButton
            toggled={true}
            label="Edit"
            toggleAriaLabel="assetEditToggle"
            toolTip="Turn Off Edit Mode"
            onClick={() => dispatch(thunkCancelAssetEdit())}
          />
        </div>
      )}
      <div className={styles.editorForm} key={String(editMode)}>
        {inEdit && (
          <>
            <span className={styles.fieldLabel}>Name *</span>
            <div className={styles.fieldControls}>
              <EmojiRenderer iconValue={asset.icon || DEFAULT_ASSET_ICON} />
              <Button
                label={emojiAnchor ? "Close" : "Pick Icon"}
                className={styles.editorButton}
                enabled={editMode}
                onClick={(e) => setEmojiAnchor(emojiAnchor ? null : e.currentTarget)}
              />
              <ValidatedInputField
                value={asset.name}
                editMode={editMode}
                fieldProps={{
                  name: "assetName",
                  ariaLabel: "Asset name",
                  validators: [(v) => validateAssetName(String(v ?? "")) || undefined],
                }}
                onSubmit={(name) => {
                  save({ name });
                }}
                styleContainer={{ ...compactFieldStyle, flex: "1 1 100px" }}
                displayStyle={{
                  fontSize: "inherit",
                  overflowWrap: "anywhere",
                  whiteSpace: "pre-wrap",
                }}
              />
            </div>
          </>
        )}
        {editMode && emojiAnchor && (
          <PickerPopover anchor={emojiAnchor} onClose={closeEmojiPicker}>
            <EmojiPicker
              emojiButtonSize={30}
              emojiSize={20}
              perLine={9}
              darkMode={true}
              onEmojiSelect={(e) => {
                save({ icon: e.unified || e.id || null });
                closeEmojiPicker();
              }}
            />
          </PickerPopover>
        )}
        <span className={styles.fieldLabel}>Radius (m)</span>
        <div className={styles.fieldControls}>
          <div data-testid="asset-editor-uncertainty">
            <ValidatedInputField
              value={String(asset.uncertaintyMeters)}
              editMode={editMode}
              styleContainer={compactFieldStyle}
              displayStyle={{ fontSize: "inherit" }}
              fieldProps={{
                name: "assetRadius",
                ariaLabel: "Radius in meters",
                validators: [(v) => validateAssetRadius(Number(v ?? "")) || undefined],
              }}
              onSubmit={(radius) => {
                save({ uncertaintyMeters: Number(radius) });
              }}
            />
          </div>
          <span className={`${styles.fieldLabel} ${styles.inlineFieldLabel}`}>Radius color</span>
          <div data-testid="asset-editor-color">
            <PathColorPickerMenu
              circular={true}
              currentColor={asset.color}
              editMode={editMode}
              updateColor={(color) => {
                save({ color });
              }}
            />
          </div>
          {editMode && asset.color && (
            <Button
              icon={faXmark}
              ariaLabel="Clear radius color"
              className={styles.editorButton}
              onClick={() => {
                save({ color: null });
              }}
            />
          )}
        </div>
        <span className={styles.fieldLabel}>Position</span>
        <div className={styles.fieldControls} data-testid="asset-editor-coordinates">
          <ValidatedInputField
            value={formattedLocation}
            displayValue={asset.location ? formattedLocation : "Not placed"}
            editMode={editMode}
            styleContainer={{ ...compactFieldStyle, flex: "1 1 110px" }}
            displayStyle={{ fontSize: "inherit" }}
            fieldProps={{
              name: "assetCoordinates",
              ariaLabel: "Asset coordinates",
              validators: [
                (v) =>
                  String(v ?? "").trim()
                    ? (parseCoordinateEntry(String(v), coordinateContext).error ?? undefined)
                    : undefined,
              ],
            }}
            onSubmit={(text) => {
              if (text.trim() === formattedLocation.trim()) return;
              const result = text.trim()
                ? parseCoordinateEntry(text, coordinateContext)
                : { location: null, error: null };
              if (!result.error) {
                dispatch(thunkCancelAssetMapDirective());
                dispatch(
                  thunkSetAssetEditLocation({
                    uuid: asset.uuid,
                    location: result.location,
                    saveImmediately: true,
                  })
                );
              }
            }}
          />
          {editMode &&
            (mapAction === "createMarker" || mapAction === "editMarker" ? (
              <Button
                icon={faBan}
                label="Cancel Pos."
                className={styles.editorButton}
                onClick={() => dispatch(thunkCancelAssetMapDirective())}
              />
            ) : (
              <Button
                icon={faCrosshairs}
                label={asset.location ? "Edit Pos." : "Place on Map"}
                className={styles.editorButton}
                toolTip={blocked}
                enabled={!blocked}
                onClick={() => {
                  setSubmenuAssets({ show: true, showLabels: true });
                  dispatch(thunkStartAssetMapDirective());
                }}
              />
            ))}
        </div>
        {(asset.location || inEdit?.elevationPending) && (
          <div className={`${styles.fieldNote} ${styles.fieldValueColumn}`}>
            {coordinateContext.usingLGRSCoordinates && asset.location && (
              <span>{formatLatLng(asset.location)}</span>
            )}
            <span data-testid="asset-editor-elevation">
              Elev.{" "}
              {inEdit?.elevationPending
                ? "Fetching…"
                : asset.elevation !== null
                  ? `${asset.elevation.toFixed(1)} m`
                  : "—"}
            </span>
          </div>
        )}
        {editMode && (mapAction === "createMarker" || mapAction === "editMarker") && (
          <span
            className={`${styles.fieldNote} ${styles.fieldValueColumn}`}
            data-testid="asset-editor-map-directive-hint"
          >
            Click the map to place the asset.
          </span>
        )}
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
        <span className={styles.fieldLabel}>PET</span>
        <ValidatedInputField
          value={formattedPet}
          editMode={editMode}
          styleContainer={compactFieldStyle}
          displayStyle={{ fontSize: "inherit" }}
          fitDialogToContents={true}
          displayValue={<span data-testid="asset-editor-pet">{formattedPet || "—"}</span>}
          fieldProps={{
            name: "assetPet",
            ariaLabel: "Asset PET",
            validators: [validators.mustBeHHMMSS],
          }}
          onSubmit={(value) => {
            dispatch(
              thunkUpdateAssetFields({
                assetUuid: asset.uuid,
                changes: { petSeconds: parseAssetPetSeconds(value) },
              })
            );
          }}
          renderInput={(input) => {
            const error = validators.mustBeHHMMSS(input.value);
            return (
              <div className={`${styles.petControls} ${styles.petPopoverControls}`}>
                <input
                  {...input}
                  onChange={(e) => input.onChange(filterHHMMSS(e.target.value))}
                  className={formStyles.editField}
                  aria-label="Asset PET"
                  aria-invalid={!!error}
                  data-testid="asset-editor-pet-input"
                  placeholder="+HH:MM:SS"
                />
                {hasRunningRex && (
                  <Button
                    label="Set to current PET"
                    className={styles.editorButton}
                    enabled={currentPetAvailable}
                    toolTip={currentPetAvailable ? undefined : "No running REX with a valid PET"}
                    onClick={() => {
                      const { petSeconds } = getCurrentAssetPet(
                        { rexes },
                        getAccurateNow().getTime()
                      );
                      if (petSeconds !== null) input.onChange(hhmmssFromSeconds(petSeconds));
                    }}
                  />
                )}
              </div>
            );
          }}
        />
        <span className={`${styles.fieldLabel} ${styles.notesLabel}`}>Notes</span>
        <div className={styles.viewNotes} data-testid="asset-editor-notes">
          <ValidatedTextArea
            value={asset.notes || ""}
            maxRows={6}
            resizable={true}
            editMode={editMode}
            styleContainer={compactFieldStyle}
            fieldProps={{
              name: "assetNotes",
              ariaLabel: "Asset notes",
              validators: [(v) => validateAssetNotes(String(v ?? "")) || undefined],
            }}
            onSubmit={(notes) => {
              save({ notes: notes || null });
            }}
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
