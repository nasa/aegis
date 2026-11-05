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
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { updateAssetInEditValues } from "store/asset";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import {
  thunkCancelAssetEdit,
  thunkCancelAssetMapDirective,
  thunkDeleteAsset,
  thunkSaveAssetEdit,
  thunkSetAssetEditLocation,
  thunkStartAssetMapDirective,
} from "store/thunk/thunkAsset";
import {
  DEFAULT_ASSET_ICON,
  getAssetEditValues,
  getAssetFolderUuidByItem,
  getAssetHiddenReason,
  getCurrentAssetPet,
  parseAssetPetSeconds,
  getChangedAssetFields,
  validateAssetEditValues,
} from "utils/assets";
import {
  formatCoordinateEntry,
  formatLatLng,
  getCoordinateEntryHint,
  getLiveCoordinateEntryError,
  parseCoordinateEntry,
} from "utils/coordinateEntry";
import { getAccurateNow, hhmmssFromSeconds } from "utils/formatting";
import { COLOR_PALATTE } from "utils/consts";

/** UTC wall-clock time, e.g. "2026-10-30 14:05:09 UTC". */
export function formatUtcTime(ms: number): string {
  return `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

type Props =
  | {
      mode?: "edit";
      inEdit: AssetInEdit;
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
  const inEdit = isView ? null : props.inEdit;
  const assetUuid = isView ? props.asset.uuid : props.inEdit.uuid;
  const values = isView ? getAssetEditValues(props.asset) : props.inEdit.values;
  const { canMutate, coordinateContext } = props;
  const editable = !isView && canMutate;
  const lastModifiedAt = useMissionDocSelector(
    (m) => (isView ? props.asset.updatedAt : (m.assets?.[assetUuid]?.updatedAt ?? null)),
    refEqual
  );
  const petSourceNames = useMissionDocSelector((m) => {
    const rex = values.petRex ? m.rexes?.[values.petRex.uuid] : null;
    const rexEva = rex ? m.evas?.[rex.evaUuid] : null;
    return {
      eva: rexEva ? getAsPlannedEvaFromRefUuid(m, rexEva.refUuid)?.name : null,
      rex: rex?.name || values.petRex?.name || values.petRex?.uuid,
    };
  }, shallowEqual);

  const mapAction = useAppSelector(
    (s) =>
      !isView &&
      s.map.mapDirective?.mapItemType === "asset" &&
      s.map.mapDirective.uuid === assetUuid
        ? s.map.mapDirective.mapAction
        : null,
    refEqual
  );
  const mapDirectiveActive = mapAction === "createMarker" || mapAction === "editMarker";

  // Shared flags of the saved asset that would keep its marker off the map.
  const hidden = useMissionDocSelector((m) => {
    const asset = m.assets?.[assetUuid];
    if (!asset) return null;
    const folderUuid = getAssetFolderUuidByItem(Object.values(m.folders ?? {}))[asset.uuid];
    const folder = folderUuid ? m.folders[folderUuid] : null;
    const reason = getAssetHiddenReason(asset, folder);
    return reason ? { reason, folderName: folder?.name ?? "" } : null;
  }, shallowEqual);

  const dirty =
    !!inEdit &&
    (inEdit.isNew || Object.keys(getChangedAssetFields(inEdit.base, values)).length > 0);
  const invalid = inEdit ? validateAssetEditValues({ ...values, name: values.name.trim() }) : null;

  // --- Text fields kept local so partial input can be typed ---
  const formattedLocation = formatCoordinateEntry(values.location, coordinateContext);
  const [coordinateText, setCoordinateText] = useState(formattedLocation);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
  const uncertaintyValid = (() => {
    const parsed = Number(uncertaintyText);
    return uncertaintyText.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  })();

  const formattedPet = values.petSeconds === null ? "" : hhmmssFromSeconds(values.petSeconds);
  const [petUpdate, setPetUpdate] = useState<"manual" | "current" | "clear">("manual");
  useEffect(() => setPetUpdate("manual"), [assetUuid, isView]);
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
    editable &&
    (dirty || petUpdate !== "manual") &&
    !invalid &&
    !petError &&
    uncertaintyValid &&
    !saving;
  const emojiDialogRef = useRef<HTMLDialogElement>(null);
  const colorSwatchRef = useRef<HTMLButtonElement>(null);
  const colorDialogRef = useRef<HTMLDialogElement>(null);

  /** Open the color dialog in the top layer, anchored below the swatch (flipped up near the bottom). */
  const openColorPicker = () => {
    const dialog = colorDialogRef.current;
    if (!dialog) return;
    const swatch = colorSwatchRef.current?.getBoundingClientRect();
    dialog.showModal();
    if (!swatch) return;
    const rect = dialog.getBoundingClientRect();
    const left = Math.max(8, Math.min(swatch.left, window.innerWidth - rect.width - 8));
    const below = swatch.bottom + 4;
    const top = below + rect.height > window.innerHeight - 8 ? swatch.top - rect.height - 4 : below;
    dialog.style.left = `${left}px`;
    dialog.style.top = `${Math.max(8, top)}px`;
  };

  const submitCoordinates = () => {
    if (!inEdit) return;
    const text = coordinateText.trim();
    // Unchanged or cleared text never moves or clears an existing location.
    if (text === formattedLocation.trim() || !text) {
      setCoordinateText(formattedLocation);
      setSubmitError(null);
      return;
    }
    const result = parseCoordinateEntry(text, coordinateContext);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    setSubmitError(null);
    dispatch(thunkCancelAssetMapDirective());
    dispatch(thunkSetAssetEditLocation({ uuid: inEdit.uuid, location: result.location }));
  };

  // Live validation while typing; the authoritative submit check reports on blur/Enter.
  const liveCoordinateError = isView
    ? null
    : getLiveCoordinateEntryError(coordinateText, coordinateContext);
  const coordinateError = submitError ?? liveCoordinateError;

  const startMapDirective = () => {
    // Placing turns the viewer's Assets and Asset Labels back on; shared flags never change.
    setSubmenuAssets({ show: true, showLabels: true });
    dispatch(thunkStartAssetMapDirective());
  };

  const editPosBlockedReason =
    values.location && hidden
      ? hidden.reason === "asset"
        ? "This asset is hidden on the map. Show it in the table to edit its position on the map, or enter coordinates."
        : `This asset's folder "${hidden.folderName}" is hidden on the map. Show the folder to edit its position on the map, or enter coordinates.`
      : null;

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
            : petError || invalid || (dirty || petUpdate !== "manual" ? "Save" : "Nothing to save")
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
    <div
      className={`${styles.editor} ${isView ? styles.editorView : ""}`}
      data-testid="asset-editor"
    >
      <div className={styles.editorHeader}>
        <div className={styles.editorHeading}>
          {isView ? "Asset Details" : inEdit?.isNew ? "Add Asset" : "Edit Asset"}
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
                    dispatch(updateAssetInEditValues({ icon: e.unified || e.id || null }));
                    emojiDialogRef.current?.close();
                  }}
                />
                {values.icon && (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => {
                      dispatch(updateAssetInEditValues({ icon: null }));
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
              onChange={(e) => dispatch(updateAssetInEditValues({ name: e.target.value }))}
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
                  dispatch(updateAssetInEditValues({ uncertaintyMeters: parsed }));
                }
              }}
            />
            <span className={styles.fieldNote}>m</span>
            <span className={`${styles.fieldLabel} ${styles.inlineFieldLabel}`}>Radius color</span>
            <button
              type="button"
              ref={colorSwatchRef}
              className={styles.colorSwatch}
              style={
                values.color
                  ? { backgroundColor: values.color, backgroundImage: "none" }
                  : undefined
              }
              onClick={openColorPicker}
              disabled={!editable}
              aria-label="Choose radius color"
              data-testid="asset-editor-color"
            />
            <dialog
              ref={colorDialogRef}
              className={styles.colorDialog}
              onClick={() => colorDialogRef.current?.close()}
            >
              <div className={styles.colorMenu} onClick={(e) => e.stopPropagation()}>
                <CompactColor
                  color={values.color ?? undefined}
                  colors={COLOR_PALATTE}
                  rectProps={{ style: { borderRadius: "50%" } }}
                  onChange={(color) => {
                    dispatch(updateAssetInEditValues({ color: color.hex }));
                    colorDialogRef.current?.close();
                  }}
                />
              </div>
            </dialog>
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
                toolTip={editPosBlockedReason ?? undefined}
                className={styles.editorButton}
                iconStyle={{ marginRight: 2 }}
                enabled={editable && !editPosBlockedReason}
              />
            )}
          </div>
        )}
        {(values.location || inEdit?.elevationPending) && (
          <div className={`${styles.fieldNote} ${styles.fieldValueColumn}`}>
            {values.location && <span>{formatLatLng(values.location)}</span>}
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

        {isView && (
          <>
            <span className={styles.fieldLabel}>EVA/REX</span>
            <div className={styles.petSourceNames}>
              <span
                className={styles.evaName}
                data-testid="asset-editor-eva"
                title={petSourceNames.eva || undefined}
              >
                {petSourceNames.eva || "—"}
              </span>
              <span>/</span>
              <span
                className={styles.rexName}
                data-testid="asset-editor-rex"
                title={petSourceNames.rex || undefined}
              >
                {petSourceNames.rex || "—"}
              </span>
            </div>
          </>
        )}

        <span className={styles.fieldLabel}>PET</span>
        {isView ? (
          <span className={styles.viewValue} data-testid="asset-editor-pet">
            {formattedPet || "—"}
          </span>
        ) : (
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
        )}
        {!isView && petError && (
          <div
            className={`${styles.fieldError} ${styles.fieldValueColumn}`}
            data-testid="asset-editor-pet-error"
          >
            {petError}
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
            onChange={(e) => dispatch(updateAssetInEditValues({ notes: e.target.value || null }))}
          />
        )}
        {lastModifiedAt !== null && (
          <div className={styles.editorLastModified} data-testid="asset-editor-last-modified">
            Last modified {formatUtcTime(lastModifiedAt)}
          </div>
        )}
      </div>
    </div>
  );
};
