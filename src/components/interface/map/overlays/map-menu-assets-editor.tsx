import type { FunctionComponent } from "react";
import { useCallback, useEffect, useState } from "react";
import { PickerPopover } from "components/interface/form/PickerPopover";
import { faBan, faCrosshairs, faFloppyDisk, faXmark } from "@fortawesome/free-solid-svg-icons";

import styles from "./map-menu-assets.module.css";
import { Button, PathColorPickerMenu } from "components/interface/form/globalFields";
import { EmojiPicker, EmojiRenderer } from "components/interface/emojis";
import { useMapMenuSetters } from "../MapMenuProvider";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { updateAssetInEditValues } from "store/asset";
import {
  thunkCancelAssetEdit,
  thunkCancelAssetMapDirective,
  thunkSaveAssetEdit,
  thunkSetAssetEditLocation,
  thunkStartAssetMapDirective,
} from "store/thunk/thunkAsset";
import {
  ASSET_NAME_MAX_LENGTH,
  ASSET_NOTES_MAX_LENGTH,
  DEFAULT_ASSET_ICON,
  getCurrentAssetPet,
  parseAssetPetSeconds,
  validateAssetEditValues,
  validateAssetName,
  validateAssetNotes,
  validateAssetRadius,
} from "utils/assets";
import {
  formatCoordinateEntry,
  formatLatLng,
  getCoordinateEntryHint,
  getLiveCoordinateEntryError,
  parseCoordinateEntry,
} from "utils/coordinateEntry";
import { getAccurateNow, hhmmssFromSeconds } from "utils/formatting";

/** UTC wall-clock time, e.g. "2026-10-30 14:05:09 UTC". */
export function formatUtcTime(ms: number): string {
  return `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

// Creation keeps a draft with Save/Cancel; saved assets use AssetDetails.
export const AssetEditor: FunctionComponent<{
  inEdit: AssetInEdit;
  canMutate: boolean;
  coordinateContext: CoordinateEntryContext;
}> = ({ inEdit, canMutate, coordinateContext }) => {
  const dispatch = useAppDispatch();
  const { setSubmenuAssets } = useMapMenuSetters();
  const assetUuid = inEdit.uuid;
  const values = inEdit.values;
  const editable = canMutate;
  const mapAction = useAppSelector(
    (s) =>
      s.map.mapDirective?.mapItemType === "asset" && s.map.mapDirective.uuid === assetUuid
        ? s.map.mapDirective.mapAction
        : null,
    refEqual
  );
  const mapDirectiveActive = mapAction === "createMarker" || mapAction === "editMarker";

  const invalid = validateAssetEditValues({ ...values, name: values.name.trim() });
  const nameError = validateAssetName(values.name);
  const notesError = validateAssetNotes(values.notes);

  // --- Text fields kept local so partial input can be typed ---
  const formattedLocation = formatCoordinateEntry(values.location, coordinateContext);
  const [coordinateText, setCoordinateText] = useState(formattedLocation);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const coordinateValidationError =
    coordinateText.trim() && coordinateText.trim() !== formattedLocation.trim()
      ? parseCoordinateEntry(coordinateText, coordinateContext).error
      : null;
  useEffect(() => {
    setCoordinateText(formattedLocation);
    setSubmitError(null);
  }, [formattedLocation]);

  const [uncertaintyText, setUncertaintyText] = useState(String(values.uncertaintyMeters));
  useEffect(() => {
    setUncertaintyText((current) =>
      Number(current) === values.uncertaintyMeters ? current : String(values.uncertaintyMeters)
    );
  }, [values.uncertaintyMeters]);
  const uncertaintyError = validateAssetRadius(Number(uncertaintyText));
  const uncertaintyValid = !uncertaintyError;

  const formattedPet = values.petSeconds === null ? "" : hhmmssFromSeconds(values.petSeconds);
  const [petUpdate, setPetUpdate] = useState<"manual" | "current" | "clear">("manual");
  useEffect(() => setPetUpdate("manual"), [assetUuid]);
  const currentPetAvailable = useMissionDocSelector(
    (m) => getCurrentAssetPet(m, getAccurateNow().getTime()).petSeconds !== null,
    refEqual
  );
  const [petText, setPetText] = useState(formattedPet);
  useEffect(() => {
    setPetText((current) =>
      parseAssetPetSeconds(current) === values.petSeconds ? current : formattedPet
    );
  }, [values.petSeconds, formattedPet]);
  const petError =
    petUpdate === "current" && !currentPetAvailable
      ? "No running REX with a valid PET"
      : petUpdate === "manual" && petText.trim() && parseAssetPetSeconds(petText) === null
        ? "Enter PET as +HH:MM:SS or -HH:MM:SS"
        : null;

  const [saving, setSaving] = useState(false);
  const saveEnabled =
    editable && !invalid && !petError && !coordinateValidationError && uncertaintyValid && !saving;
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const closeEmojiPicker = useCallback(() => setEmojiAnchor(null), []);

  const submitCoordinates = () => {
    const text = coordinateText.trim();
    if (text === formattedLocation.trim()) {
      setCoordinateText(formattedLocation);
      setSubmitError(null);
      return true;
    }
    const result = text
      ? parseCoordinateEntry(text, coordinateContext)
      : { location: null, error: null };
    if (result.error) {
      setSubmitError(result.error);
      return false;
    }
    setSubmitError(null);
    dispatch(thunkCancelAssetMapDirective());
    dispatch(thunkSetAssetEditLocation({ uuid: inEdit.uuid, location: result.location }));
    return true;
  };

  // Live validation while typing; the authoritative submit check reports on blur/Enter.
  const liveCoordinateError = getLiveCoordinateEntryError(coordinateText, coordinateContext);
  const coordinateError = submitError ?? liveCoordinateError;

  const startMapDirective = () => {
    // Placing turns the viewer's Assets and Asset Labels back on; shared flags never change.
    setSubmenuAssets({ show: true, showLabels: true });
    dispatch(thunkStartAssetMapDirective());
  };

  const actions = (
    <div className={styles.editorActions}>
      <Button
        onClick={async () => {
          if (!submitCoordinates()) return;
          setSaving(true);
          try {
            await dispatch(thunkSaveAssetEdit(petUpdate === "manual" ? undefined : { petUpdate }));
          } finally {
            setSaving(false);
          }
        }}
        icon={faFloppyDisk}
        ariaLabel="Save"
        toolTip={
          saving
            ? inEdit?.elevationPending
              ? "Waiting for elevation…"
              : "Saving…"
            : petError || coordinateValidationError || invalid || "Save"
        }
        className={`${styles.iconOnlyButton} ${saveEnabled ? styles.saveButton : styles.saveButtonDisabled}`}
        enabled={saveEnabled}
      />
      <Button
        onClick={() => dispatch(thunkCancelAssetEdit())}
        icon={faBan}
        ariaLabel="Cancel"
        toolTip="Cancel"
        className={styles.iconOnlyButton}
      />
    </div>
  );

  return (
    <div className={styles.editor} data-testid="asset-editor">
      <div className={styles.editorHeader}>
        <div className={styles.editorHeading}>Add Asset</div>
        {actions}
      </div>

      <div className={styles.editorForm}>
        <>
          <span className={styles.fieldLabel}>Name *</span>
          <div className={styles.fieldControls}>
            <EmojiRenderer iconValue={values.icon || DEFAULT_ASSET_ICON} />
            <Button
              label={emojiAnchor ? "Close" : "Pick Icon"}
              className={styles.editorButton}
              enabled={editable}
              onClick={(e) => setEmojiAnchor(emojiAnchor ? null : e.currentTarget)}
            />
            <input
              className={`${styles.editorInput} ${styles.growInput}`}
              value={values.name}
              placeholder="Required"
              aria-label="Asset name"
              data-testid="asset-editor-name"
              disabled={!editable}
              maxLength={ASSET_NAME_MAX_LENGTH}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "asset-name-error" : undefined}
              onChange={(e) => dispatch(updateAssetInEditValues({ name: e.target.value }))}
            />
          </div>
          {nameError && (
            <div
              id="asset-name-error"
              className={`${styles.fieldError} ${styles.fieldValueColumn}`}
            >
              {nameError}
            </div>
          )}
        </>

        {editable && emojiAnchor && (
          <PickerPopover anchor={emojiAnchor} onClose={closeEmojiPicker}>
            <EmojiPicker
              emojiButtonSize={30}
              emojiSize={20}
              perLine={9}
              darkMode={true}
              onEmojiSelect={(e) => {
                dispatch(updateAssetInEditValues({ icon: e.unified || e.id || null }));
                closeEmojiPicker();
              }}
            />
          </PickerPopover>
        )}
        <span className={styles.fieldLabel}>Radius (m)</span>
        <div className={styles.fieldControls}>
          <input
            className={`${styles.editorInput} ${styles.numberInput} ${
              uncertaintyValid ? "" : styles.editorInputError
            }`}
            value={uncertaintyText}
            inputMode="decimal"
            aria-label="Radius in meters"
            aria-invalid={!!uncertaintyError}
            aria-describedby={uncertaintyError ? "asset-radius-error" : undefined}
            data-testid="asset-editor-uncertainty"
            disabled={!editable}
            onChange={(e) => {
              setUncertaintyText(e.target.value);
              const parsed = Number(e.target.value);
              if (!validateAssetRadius(parsed)) {
                dispatch(updateAssetInEditValues({ uncertaintyMeters: parsed }));
              }
            }}
            onBlur={() => {
              if (!uncertaintyText.trim()) setUncertaintyText("0");
            }}
          />
          <span className={`${styles.fieldLabel} ${styles.inlineFieldLabel}`}>Radius color</span>
          <div data-testid="asset-editor-color">
            <PathColorPickerMenu
              circular={true}
              currentColor={values.color || "#00000000"}
              editMode={editable}
              updateColor={(color) => dispatch(updateAssetInEditValues({ color }))}
            />
          </div>
          {values.color ? (
            <Button
              onClick={() => dispatch(updateAssetInEditValues({ color: null }))}
              icon={faXmark}
              label="Clear"
              ariaLabel="Clear radius color"
              className={styles.editorButton}
              enabled={editable}
            />
          ) : (
            <span className={styles.fieldNote}>Default</span>
          )}
        </div>

        {uncertaintyError && (
          <div
            id="asset-radius-error"
            className={`${styles.fieldError} ${styles.fieldValueColumn}`}
          >
            {uncertaintyError}
          </div>
        )}

        <span className={styles.fieldLabel}>Position</span>
        <div className={styles.fieldControls}>
          <input
            className={`${styles.editorInput} ${styles.growInput} ${
              coordinateError ? styles.editorInputError : ""
            }`}
            value={coordinateText}
            placeholder={getCoordinateEntryHint(coordinateContext)}
            aria-label="Asset coordinates"
            data-testid="asset-editor-coordinates"
            disabled={!editable}
            onChange={(e) => {
              setCoordinateText(e.target.value);
              setSubmitError(null);
            }}
            onBlur={submitCoordinates}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCoordinates();
              if (e.key === "Escape") {
                setCoordinateText(formattedLocation);
                setSubmitError(null);
              }
            }}
          />
          {mapDirectiveActive ? (
            <Button
              onClick={() => dispatch(thunkCancelAssetMapDirective())}
              icon={faBan}
              label="Cancel Pos."
              className={styles.editorButton}
            />
          ) : (
            <Button
              onClick={startMapDirective}
              icon={faCrosshairs}
              label={values.location ? "Edit Pos." : "Place on Map"}
              className={styles.editorButton}
              iconStyle={{ marginRight: 2 }}
              enabled={editable}
            />
          )}
        </div>
        {(values.location || inEdit?.elevationPending) && (
          <div className={`${styles.fieldNote} ${styles.fieldValueColumn}`}>
            {coordinateContext.usingLGRSCoordinates && values.location && (
              <span>{formatLatLng(values.location)}</span>
            )}
            <span data-testid="asset-editor-elevation">
              Elev.{" "}
              {inEdit?.elevationPending
                ? "Fetching…"
                : values.elevation !== null
                  ? `${values.elevation.toFixed(1)} m`
                  : "—"}
            </span>
          </div>
        )}
        {coordinateError && (
          <div
            className={`${styles.fieldError} ${styles.fieldValueColumn}`}
            data-testid="asset-editor-coordinate-error"
          >
            {coordinateError}
          </div>
        )}
        {mapDirectiveActive && (
          <div
            className={`${styles.mapDirectiveHint} ${styles.fieldValueColumn}`}
            data-testid="asset-editor-map-directive-hint"
          >
            Click the map to place the asset, or enter coordinates. Save to keep changes.
          </div>
        )}

        <span className={styles.fieldLabel}>PET</span>
        <div className={styles.fieldControls}>
          {petUpdate === "manual" ? (
            <input
              className={`${styles.editorInput} ${styles.petInput} ${petError ? styles.editorInputError : ""}`}
              value={petText}
              placeholder="+HH:MM:SS"
              aria-label="Asset PET"
              aria-invalid={!!petError}
              data-testid="asset-editor-pet"
              disabled={!editable}
              onChange={(e) => {
                const text = e.target.value;
                setPetText(text);
                const seconds = parseAssetPetSeconds(text);
                if (!text.trim() || seconds !== null) {
                  dispatch(updateAssetInEditValues({ petSeconds: seconds }));
                }
              }}
              onBlur={() => {
                if (!petError) setPetText(formattedPet);
              }}
            />
          ) : (
            <span className={styles.fieldNote}>
              {petUpdate === "clear" ? "No PET" : "Captured when saved"}
            </span>
          )}
          <select
            className={styles.editorInput}
            aria-label="PET update"
            value={petUpdate}
            disabled={!editable}
            onChange={(e) => setPetUpdate(e.target.value as typeof petUpdate)}
          >
            <option value="manual">Keep / edit PET</option>
            <option value="current" disabled={!currentPetAvailable}>
              Use current PET on save
            </option>
            <option value="clear">Clear PET on save</option>
          </select>
        </div>
        {petError && (
          <div
            className={`${styles.fieldError} ${styles.fieldValueColumn}`}
            data-testid="asset-editor-pet-error"
          >
            {petError}
          </div>
        )}

        <span className={`${styles.fieldLabel} ${styles.notesLabel}`}>Notes</span>
        <textarea
          className={`${styles.editorInput} ${styles.editorNotes}`}
          value={values.notes ?? ""}
          placeholder="Optional"
          aria-label="Asset notes"
          maxLength={ASSET_NOTES_MAX_LENGTH}
          aria-invalid={!!notesError}
          aria-describedby={notesError ? "asset-notes-error" : undefined}
          data-testid="asset-editor-notes"
          disabled={!editable}
          rows={3}
          onChange={(e) => dispatch(updateAssetInEditValues({ notes: e.target.value || null }))}
        />
        {notesError && (
          <div id="asset-notes-error" className={`${styles.fieldError} ${styles.fieldValueColumn}`}>
            {notesError}
          </div>
        )}
      </div>
    </div>
  );
};
