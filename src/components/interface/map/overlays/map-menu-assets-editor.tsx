import type { FunctionComponent } from "react";
import { useEffect, useRef, useState } from "react";
import { faBan, faCrosshairs, faFloppyDisk, faXmark } from "@fortawesome/free-solid-svg-icons";
import CompactColor from "@uiw/react-color-compact";

import styles from "./map-menu-assets.module.css";
import { Button } from "components/interface/form/globalFields";
import { EmojiPicker, EmojiRenderer } from "components/interface/emojis";
import { useMapMenuSetters } from "../MapMenuProvider";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { updateAssetDraftValues } from "store/asset";
import {
  thunkCancelAssetDraft,
  thunkCancelAssetGesture,
  thunkSaveAssetDraft,
  thunkSetAssetDraftLocation,
  thunkStartAssetGesture,
} from "store/thunk/thunkAsset";
import {
  DEFAULT_ASSET_ICON,
  getAssetFolderUuidByItem,
  getAssetHiddenReason,
  getAssetPlacementPetSeconds,
  getChangedAssetFields,
  validateAssetDraftValues,
} from "utils/assets";
import {
  formatCoordinateEntry,
  formatLatLng,
  getCoordinateEntryHint,
  parseCoordinateEntry,
} from "utils/coordinateEntry";
import { hhmmssFromSeconds } from "utils/formatting";
import { COLOR_PALATTE } from "utils/consts";

/** UTC wall-clock time, e.g. "2026-10-30 14:05:09 UTC". */
export function formatUtcTime(ms: number): string {
  return `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

type Props = {
  draft: AssetDraft;
  canMutate: boolean;
  coordinateContext: CoordinateEntryContext;
  /** Shown instead of the Save/Cancel row while switching to another asset is pending. */
  switchPrompt: JSX.Element | null;
};

// The black editor above the asset table, used for both Add Asset and Edit Asset.
export const AssetEditor: FunctionComponent<Props> = ({
  draft,
  canMutate,
  coordinateContext,
  switchPrompt,
}) => {
  const dispatch = useAppDispatch();
  const { setSubmenuAssets } = useMapMenuSetters();
  const values = draft.values;

  const gestureAction = useAppSelector(
    (s) =>
      s.map.mapDirective?.mapItemType === "asset" && s.map.mapDirective.uuid === draft.uuid
        ? s.map.mapDirective.mapAction
        : null,
    refEqual
  );
  const gestureActive = gestureAction === "createMarker" || gestureAction === "editMarker";

  // Shared flags of the saved asset that would keep its marker off the map.
  const hidden = useMissionDocSelector((m) => {
    const asset = m.assets?.[draft.uuid];
    if (!asset) return null;
    const folderUuid = getAssetFolderUuidByItem(Object.values(m.folders ?? {}))[asset.uuid];
    const folder = folderUuid ? m.folders[folderUuid] : null;
    const reason = getAssetHiddenReason(asset, folder);
    return reason ? { reason, folderName: folder?.name ?? "" } : null;
  }, shallowEqual);

  const provenance = useMissionDocSelector(
    (m) => ({
      rexExists: !!(values.placement?.runningRexUuid && m.rexes?.[values.placement.runningRexUuid]),
      evaExists: !!(values.placement?.runningEvaUuid && m.evas?.[values.placement.runningEvaUuid]),
    }),
    deepEqual
  );

  const dirty = draft.isNew || Object.keys(getChangedAssetFields(draft.base, values)).length > 0;
  const invalid = validateAssetDraftValues({ ...values, name: values.name.trim() });

  // --- Text fields kept local so partial input can be typed ---
  const formattedLocation = formatCoordinateEntry(values.location, coordinateContext);
  const [coordinateText, setCoordinateText] = useState(formattedLocation);
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  useEffect(() => {
    setCoordinateText(formattedLocation);
    setCoordinateError(null);
  }, [formattedLocation]);

  const [uncertaintyText, setUncertaintyText] = useState(String(values.uncertaintyMeters));
  useEffect(() => {
    setUncertaintyText((current) =>
      Number(current) === values.uncertaintyMeters ? current : String(values.uncertaintyMeters)
    );
  }, [values.uncertaintyMeters]);
  const uncertaintyValid = (() => {
    const parsed = Number(uncertaintyText);
    return uncertaintyText.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  })();

  const [saving, setSaving] = useState(false);
  const saveEnabled = canMutate && dirty && !invalid && uncertaintyValid && !saving;
  const emojiDialogRef = useRef<HTMLDialogElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const submitCoordinates = () => {
    const text = coordinateText.trim();
    // Unchanged or cleared text never moves or clears an existing location.
    if (text === formattedLocation.trim() || !text) {
      setCoordinateText(formattedLocation);
      setCoordinateError(null);
      return;
    }
    const result = parseCoordinateEntry(text, coordinateContext);
    if (result.error) {
      setCoordinateError(result.error);
      return;
    }
    setCoordinateError(null);
    dispatch(thunkCancelAssetGesture());
    dispatch(thunkSetAssetDraftLocation({ uuid: draft.uuid, location: result.location }));
  };

  const startGesture = () => {
    // Placing turns the viewer's Assets and Asset Labels back on; shared flags never change.
    setSubmenuAssets({ show: true, showLabels: true });
    dispatch(thunkStartAssetGesture());
  };

  const editPosBlockedReason =
    values.location && hidden
      ? hidden.reason === "asset"
        ? "This asset is hidden on the map. Show it in the table to edit its position on the map, or enter coordinates."
        : `This asset's folder "${hidden.folderName}" is hidden on the map. Show the folder to edit its position on the map, or enter coordinates.`
      : null;

  const petSeconds = getAssetPlacementPetSeconds(values.placement);
  const placement = values.placement;

  const actions = (
    <div className={styles.editorActions}>
      <Button
        onClick={async () => {
          setSaving(true);
          try {
            await dispatch(thunkSaveAssetDraft());
          } finally {
            setSaving(false);
          }
        }}
        icon={faFloppyDisk}
        label={saving ? (draft.elevationPending ? "Waiting…" : "Saving…") : "Save"}
        toolTip={invalid ?? (dirty ? undefined : "Nothing to save")}
        className={`${styles.editorButton} ${saveEnabled ? styles.saveButton : styles.saveButtonDisabled}`}
        enabled={saveEnabled}
      />
      <Button
        onClick={() => dispatch(thunkCancelAssetDraft())}
        icon={faXmark}
        label="Cancel"
        className={styles.editorButton}
      />
    </div>
  );

  return (
    <div className={styles.editor} data-testid="asset-editor">
      <div className={styles.editorHeader}>
        <div className={styles.editorHeading}>{draft.isNew ? "Add Asset" : "Edit Asset"}</div>
        {!switchPrompt && actions}
      </div>

      <div className={styles.editorForm}>
        <span className={styles.fieldLabel}>Name</span>
        <div className={styles.fieldControls}>
          <button
            type="button"
            className={styles.emojiButton}
            onClick={() => emojiDialogRef.current?.showModal()}
            disabled={!canMutate}
            aria-label="Choose emoji"
            data-tooltip-id="aegis-tooltip"
            data-tooltip-content="Choose emoji"
            data-testid="asset-editor-emoji"
          >
            <EmojiRenderer iconValue={values.icon || DEFAULT_ASSET_ICON} />
          </button>
          <dialog
            ref={emojiDialogRef}
            className={styles.dialogContainer}
            onClick={() => emojiDialogRef.current?.close()}
          >
            <div className={styles.pickerMenu} onClick={(e) => e.stopPropagation()}>
              <EmojiPicker
                emojiButtonSize={30}
                emojiSize={20}
                perLine={9}
                darkMode={true}
                onEmojiSelect={(e) => {
                  dispatch(updateAssetDraftValues({ icon: e.unified || e.id || null }));
                  emojiDialogRef.current?.close();
                }}
              />
              {values.icon && (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => {
                    dispatch(updateAssetDraftValues({ icon: null }));
                    emojiDialogRef.current?.close();
                  }}
                >
                  No emoji
                </button>
              )}
            </div>
          </dialog>
          <input
            className={`${styles.editorInput} ${styles.growInput}`}
            value={values.name}
            placeholder="Required"
            aria-label="Asset name"
            data-testid="asset-editor-name"
            disabled={!canMutate}
            maxLength={80}
            onChange={(e) => dispatch(updateAssetDraftValues({ name: e.target.value }))}
          />
        </div>

        <span className={styles.fieldLabel}>Marker color</span>
        <div className={styles.fieldControls}>
          <div className={styles.colorField}>
            <button
              type="button"
              className={styles.colorSwatch}
              style={
                values.color
                  ? { backgroundColor: values.color, backgroundImage: "none" }
                  : undefined
              }
              onClick={() => setShowColorPicker(true)}
              disabled={!canMutate}
              aria-label="Choose marker color"
              data-testid="asset-editor-color"
            />
            {showColorPicker && (
              <div className={styles.colorPopover}>
                <div className={styles.colorCover} onClick={() => setShowColorPicker(false)} />
                <div className={styles.colorMenu}>
                  <CompactColor
                    color={values.color ?? undefined}
                    colors={COLOR_PALATTE}
                    onChange={(color) => {
                      dispatch(updateAssetDraftValues({ color: color.hex }));
                      setShowColorPicker(false);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          {values.color ? (
            <Button
              onClick={() => dispatch(updateAssetDraftValues({ color: null }))}
              icon={faXmark}
              label="Clear"
              ariaLabel="Clear marker color"
              className={styles.editorButton}
              enabled={canMutate}
            />
          ) : (
            <span className={styles.fieldNote}>None</span>
          )}
        </div>

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
            disabled={!canMutate}
            onChange={(e) => setCoordinateText(e.target.value)}
            onBlur={submitCoordinates}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCoordinates();
              if (e.key === "Escape") {
                setCoordinateText(formattedLocation);
                setCoordinateError(null);
              }
            }}
          />
          {gestureActive ? (
            <Button
              onClick={() => dispatch(thunkCancelAssetGesture())}
              icon={faBan}
              label="Cancel Pos."
              className={styles.editorButton}
            />
          ) : (
            <Button
              onClick={startGesture}
              icon={faCrosshairs}
              label={values.location ? "Edit Pos." : "Place on Map"}
              toolTip={editPosBlockedReason ?? undefined}
              className={styles.editorButton}
              enabled={canMutate && !editPosBlockedReason}
            />
          )}
        </div>
        {(values.location || draft.elevationPending) && (
          <div className={`${styles.fieldNote} ${styles.fieldValueColumn}`}>
            {values.location && <span>{formatLatLng(values.location)}</span>}
            <span data-testid="asset-editor-elevation">
              Elev.{" "}
              {draft.elevationPending
                ? "Fetching…"
                : values.elevation !== null
                  ? `${values.elevation.toFixed(1)} m`
                  : "—"}
            </span>
          </div>
        )}
        {coordinateError && (
          <div className={`${styles.fieldError} ${styles.fieldValueColumn}`}>{coordinateError}</div>
        )}
        {gestureActive && (
          <div
            className={`${styles.gestureHint} ${styles.fieldValueColumn}`}
            data-testid="asset-editor-gesture-hint"
          >
            Click the map to place the asset, or enter coordinates. Save to keep changes.
          </div>
        )}

        <span className={styles.fieldLabel}>Radius</span>
        <div className={styles.fieldControls}>
          <input
            className={`${styles.editorInput} ${styles.numberInput} ${
              uncertaintyValid ? "" : styles.editorInputError
            }`}
            value={uncertaintyText}
            inputMode="decimal"
            aria-label="Radius in meters"
            data-testid="asset-editor-uncertainty"
            disabled={!canMutate}
            onChange={(e) => {
              setUncertaintyText(e.target.value);
              const parsed = Number(e.target.value);
              if (e.target.value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) {
                dispatch(updateAssetDraftValues({ uncertaintyMeters: parsed }));
              }
            }}
          />
          <span className={styles.fieldNote}>m</span>
        </div>

        <span className={styles.fieldLabel}>Notes</span>
        <textarea
          className={`${styles.editorInput} ${styles.editorNotes}`}
          value={values.notes ?? ""}
          placeholder="Optional"
          aria-label="Asset notes"
          data-testid="asset-editor-notes"
          disabled={!canMutate}
          rows={1}
          onChange={(e) => dispatch(updateAssetDraftValues({ notes: e.target.value || null }))}
        />

        <span className={styles.fieldLabel}>Placed</span>
        <div className={styles.fieldNote} data-testid="asset-editor-placement">
          {!placement ? (
            "Not placed"
          ) : (
            <>
              <span>PET {petSeconds === null ? "unavailable" : hhmmssFromSeconds(petSeconds)}</span>
              <span title={formatUtcTime(placement.locationSetAt)}>
                {formatUtcTime(placement.locationSetAt).slice(11)}
              </span>
              <span>
                {placement.runningRexUuid
                  ? `${placement.runningEvaName ?? "EVA"}${provenance.evaExists ? "" : " (unavailable)"} / ${
                      placement.runningRexName ?? "REX"
                    }${provenance.rexExists ? "" : " (unavailable)"}`
                  : "No running REX"}
              </span>
            </>
          )}
        </div>
      </div>

      {draft.message && (
        <div className={styles.editorMessage} role="alert" data-testid="asset-editor-message">
          {draft.message}
        </div>
      )}
      {switchPrompt}
    </div>
  );
};
