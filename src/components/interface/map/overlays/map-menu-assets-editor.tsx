import type { FunctionComponent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  faBan,
  faCrosshairs,
  faEdit,
  faFloppyDisk,
  faTrashAlt,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
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
  thunkDeleteAsset,
  thunkSaveAssetDraft,
  thunkSetAssetDraftLocation,
  thunkStartAssetGesture,
} from "store/thunk/thunkAsset";
import {
  DEFAULT_ASSET_ICON,
  getAssetDraftValues,
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

type Props =
  | {
      mode?: "edit";
      draft: AssetDraft;
      canMutate: boolean;
      coordinateContext: CoordinateEntryContext;
    }
  | {
      mode: "view";
      asset: Asset;
      canEdit: boolean;
      canMutate: boolean;
      coordinateContext: CoordinateEntryContext;
      onEdit: () => void;
    };

// Asset form panel used for Add Asset (above the table) and inside expanded asset rows (view or edit).
export const AssetEditor: FunctionComponent<Props> = (props) => {
  const dispatch = useAppDispatch();
  const { setSubmenuAssets } = useMapMenuSetters();
  const isView = props.mode === "view";
  const draft = isView ? null : props.draft;
  const assetUuid = isView ? props.asset.uuid : props.draft.uuid;
  const values = isView ? getAssetDraftValues(props.asset) : props.draft.values;
  const { canMutate, coordinateContext } = props;
  const editable = !isView && canMutate;

  const gestureAction = useAppSelector(
    (s) =>
      !isView &&
      s.map.mapDirective?.mapItemType === "asset" &&
      s.map.mapDirective.uuid === assetUuid
        ? s.map.mapDirective.mapAction
        : null,
    refEqual
  );
  const gestureActive = gestureAction === "createMarker" || gestureAction === "editMarker";

  // Shared flags of the saved asset that would keep its marker off the map.
  const hidden = useMissionDocSelector((m) => {
    const asset = m.assets?.[assetUuid];
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

  const dirty =
    !!draft && (draft.isNew || Object.keys(getChangedAssetFields(draft.base, values)).length > 0);
  const invalid = draft ? validateAssetDraftValues({ ...values, name: values.name.trim() }) : null;

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
  const saveEnabled = editable && dirty && !invalid && uncertaintyValid && !saving;
  const emojiDialogRef = useRef<HTMLDialogElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const submitCoordinates = () => {
    if (!draft) return;
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
  const placementText = !placement
    ? "Not placed"
    : [
        petSeconds === null ? null : `PET ${hhmmssFromSeconds(petSeconds)}`,
        formatUtcTime(placement.locationSetAt).slice(11),
        placement.runningRexUuid
          ? `${placement.runningEvaName ?? "EVA"}${provenance.evaExists ? "" : " (unavailable)"} / ${
              placement.runningRexName ?? "REX"
            }${provenance.rexExists ? "" : " (unavailable)"}`
          : "No running REX",
      ]
        .filter(Boolean)
        .join(" · ");

  const actions = isView ? (
    props.canEdit ? (
      <div className={styles.editorActions}>
        <Button
          onClick={props.onEdit}
          icon={faEdit}
          ariaLabel="Edit"
          toolTip="Edit"
          className={styles.iconOnlyButton}
          enabled={canMutate}
        />
        <Button
          onClick={() => {
            if (
              window.confirm(`Are you sure you want to delete the asset "${props.asset.name}"?`)
            ) {
              dispatch(thunkDeleteAsset({ assetUuid: props.asset.uuid }));
            }
          }}
          icon={faTrashAlt}
          ariaLabel="Delete"
          toolTip="Delete"
          className={styles.iconOnlyButton}
          enabled={canMutate}
        />
      </div>
    ) : null
  ) : (
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
        ariaLabel="Save"
        toolTip={
          saving
            ? draft?.elevationPending
              ? "Waiting for elevation…"
              : "Saving…"
            : (invalid ?? (dirty ? "Save" : "Nothing to save"))
        }
        className={`${styles.iconOnlyButton} ${saveEnabled ? styles.saveButton : styles.saveButtonDisabled}`}
        enabled={saveEnabled}
      />
      <Button
        onClick={() => dispatch(thunkCancelAssetDraft())}
        icon={faBan}
        ariaLabel="Cancel"
        toolTip="Cancel"
        className={styles.iconOnlyButton}
      />
    </div>
  );

  return (
    <div
      className={`${styles.editor} ${isView ? styles.editorView : ""}`}
      data-testid="asset-editor"
    >
      <div className={styles.editorHeader}>
        <div className={styles.editorHeading}>
          {isView ? "Asset Details" : draft?.isNew ? "Add Asset" : "Edit Asset"}
        </div>
        <div
          className={styles.editorPlacement}
          title={
            placement ? `${placementText} (${formatUtcTime(placement.locationSetAt)})` : undefined
          }
          data-testid="asset-editor-placement"
        >
          {placementText}
        </div>
        {actions}
      </div>

      <div className={styles.editorForm}>
        <span className={styles.fieldLabel}>Name</span>
        {isView ? (
          <div className={styles.fieldControls}>
            <span className={styles.viewEmoji} data-testid="asset-editor-emoji">
              <EmojiRenderer iconValue={values.icon || DEFAULT_ASSET_ICON} />
            </span>
            <span className={styles.viewValue} data-testid="asset-editor-name">
              {values.name}
            </span>
          </div>
        ) : (
          <div className={styles.fieldControls}>
            <button
              type="button"
              className={styles.emojiButton}
              onClick={() => emojiDialogRef.current?.showModal()}
              disabled={!editable}
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
              disabled={!editable}
              maxLength={80}
              onChange={(e) => dispatch(updateAssetDraftValues({ name: e.target.value }))}
            />
          </div>
        )}

        <span className={styles.fieldLabel}>Radius</span>
        {isView ? (
          <div className={styles.fieldControls}>
            <span className={styles.viewValue} data-testid="asset-editor-uncertainty">
              {values.uncertaintyMeters} m
            </span>
            <span className={`${styles.fieldLabel} ${styles.inlineFieldLabel}`}>Radius color</span>
            {values.color ? (
              <span
                className={styles.viewColorSwatch}
                style={{ backgroundColor: values.color }}
                data-testid="asset-editor-color"
              />
            ) : (
              <span className={styles.viewValue} data-testid="asset-editor-color">
                Default
              </span>
            )}
          </div>
        ) : (
          <div className={styles.fieldControls}>
            <input
              className={`${styles.editorInput} ${styles.numberInput} ${
                uncertaintyValid ? "" : styles.editorInputError
              }`}
              value={uncertaintyText}
              inputMode="decimal"
              aria-label="Radius in meters"
              data-testid="asset-editor-uncertainty"
              disabled={!editable}
              onChange={(e) => {
                setUncertaintyText(e.target.value);
                const parsed = Number(e.target.value);
                if (e.target.value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) {
                  dispatch(updateAssetDraftValues({ uncertaintyMeters: parsed }));
                }
              }}
            />
            <span className={styles.fieldNote}>m</span>
            <span className={`${styles.fieldLabel} ${styles.inlineFieldLabel}`}>Radius color</span>
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
                disabled={!editable}
                aria-label="Choose radius color"
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
                ariaLabel="Clear radius color"
                className={styles.editorButton}
                enabled={editable}
              />
            ) : (
              <span className={styles.fieldNote}>Default</span>
            )}
          </div>
        )}

        <span className={styles.fieldLabel}>Position</span>
        {isView ? (
          <div className={styles.fieldControls}>
            <span className={styles.viewValue} data-testid="asset-editor-coordinates">
              {values.location ? formattedLocation : "Not placed"}
            </span>
          </div>
        ) : (
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
                iconStyle={{ marginRight: 2 }}
                enabled={editable && !editPosBlockedReason}
              />
            )}
          </div>
        )}
        {(values.location || draft?.elevationPending) && (
          <div className={`${styles.fieldNote} ${styles.fieldValueColumn}`}>
            {values.location && <span>{formatLatLng(values.location)}</span>}
            <span data-testid="asset-editor-elevation">
              Elev.{" "}
              {draft?.elevationPending
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

        <span className={styles.fieldLabel}>Notes</span>
        {isView ? (
          <span
            className={`${styles.viewValue} ${styles.viewNotes}`}
            data-testid="asset-editor-notes"
          >
            {values.notes || "—"}
          </span>
        ) : (
          <textarea
            className={`${styles.editorInput} ${styles.editorNotes}`}
            value={values.notes ?? ""}
            placeholder="Optional"
            aria-label="Asset notes"
            data-testid="asset-editor-notes"
            disabled={!editable}
            rows={1}
            onChange={(e) => dispatch(updateAssetDraftValues({ notes: e.target.value || null }))}
          />
        )}
      </div>

      {draft?.message && (
        <div className={styles.editorMessage} role="alert" data-testid="asset-editor-message">
          {draft.message}
        </div>
      )}
    </div>
  );
};
