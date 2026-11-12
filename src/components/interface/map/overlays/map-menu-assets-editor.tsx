import type { CSSProperties, FunctionComponent } from "react";
import { useCallback, useEffect, useState } from "react";
import { PickerPopover } from "components/interface/form/PickerPopover";
import { faBan, faCrosshairs, faFloppyDisk, faXmark } from "@fortawesome/free-solid-svg-icons";

import { LastEditedNumeric } from "components/interface/_global-elements";
import { AssetPetSource } from "./map-menu-asset-details";
import styles from "./map-menu-assets.module.css";
import {
  Button,
  InLineEditInput,
  PathColorPickerMenu,
  TextArea,
} from "components/interface/form/globalFields";
import {
  composeValidators,
  validators,
  type Stringy,
} from "components/interface/form/formValidators";
import { EmojiPicker, EmojiRenderer } from "components/interface/emojis";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { setAssetInEditPet, updateAssetInEditValues } from "store/asset";
import {
  thunkCancelAssetEdit,
  thunkCancelAssetMapDirective,
  thunkSaveAssetEdit,
  thunkSetAssetEditLocation,
  thunkStartAssetMapDirective,
} from "store/thunk/thunkAsset";
import {
  ASSET_RADIUS_MAX_METERS,
  ASSET_NAME_MAX_LENGTH,
  ASSET_NOTES_MAX_LENGTH,
  DEFAULT_ASSET_ICON,
  getAssetColor,
  getCurrentAssetPet,
  parseAssetPetSeconds,
} from "utils/assets";
import {
  formatCoordinateEntry,
  formatLatLng,
  getCoordinateEntryHint,
  getLiveCoordinateEntryError,
  parseCoordinateEntry,
} from "utils/coordinateEntry";
import { getAccurateNow, hhmmssFromSeconds } from "utils/formatting";

const NAME_VALIDATORS = [validators.required, validators.maxLength(ASSET_NAME_MAX_LENGTH)];
const RADIUS_VALIDATORS = [
  validators.mustBeNumber,
  validators.minValue(0),
  validators.maxValue(ASSET_RADIUS_MAX_METERS),
];
const PET_VALIDATORS = [validators.mustBeHHMMSS];
const NOTES_VALIDATORS = [validators.maxLength(ASSET_NOTES_MAX_LENGTH)];

const GROW_INPUT_CONTAINER_STYLE: CSSProperties = { flex: "1 1 110px", minWidth: 0 };
// Sizes the notes box by its rows so the editor fits the floating widget; the user can resize it.
const NOTES_TEXT_AREA_STYLE: CSSProperties = {
  height: "auto",
  minHeight: 22,
  boxSizing: "border-box",
  lineHeight: 1.4,
  fontFamily: "inherit",
  overflowWrap: "anywhere",
  overflowY: "auto",
  resize: "both",
};

// Runs a field's validators against its text so Save stays disabled while any field is invalid.
function getFieldTextError(
  fieldValidators: Array<(value: Stringy) => string | undefined>,
  text: string
): string | undefined {
  return composeValidators(...fieldValidators)(text, {});
}

/** UTC wall-clock time, e.g. "2026-10-30 14:05:09 UTC". */
export function formatUtcTime(ms: number): string {
  return `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

interface AssetEditorProps {
  inEdit: AssetInEdit;
  asset?: Asset;
  canMutate: boolean;
  coordinateContext: CoordinateEntryContext;
}

// Save commits the Redux preview's changed fields together.
export const AssetEditor: FunctionComponent<AssetEditorProps> = ({
  inEdit,
  asset,
  canMutate,
  coordinateContext,
}) => {
  const dispatch = useAppDispatch();
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

  const formattedLocation = formatCoordinateEntry(values.location, coordinateContext);
  const formattedPet = values.petSeconds === null ? "" : hhmmssFromSeconds(values.petSeconds);
  const [fieldText, setFieldText] = useState<AssetEditorFieldText>(() => ({
    name: values.name,
    radius: String(values.uncertaintyMeters),
    coordinates: formattedLocation,
    pet: formattedPet,
    notes: values.notes ?? "",
  }));
  const setText = (field: keyof AssetEditorFieldText, text: string) =>
    setFieldText((previous) => ({ ...previous, [field]: text }));

  // Show values set outside the fields, such as a map placement or the current PET.
  useEffect(() => {
    setFieldText((previous) => ({ ...previous, coordinates: formattedLocation }));
  }, [formattedLocation]);
  useEffect(() => {
    setFieldText((previous) =>
      Number(previous.radius) === values.uncertaintyMeters
        ? previous
        : { ...previous, radius: String(values.uncertaintyMeters) }
    );
  }, [values.uncertaintyMeters]);
  useEffect(() => {
    setFieldText((previous) =>
      parseAssetPetSeconds(previous.pet) === values.petSeconds
        ? previous
        : { ...previous, pet: formattedPet }
    );
  }, [values.petSeconds, formattedPet]);

  // Partial coordinates are allowed while typing; the full parse runs on blur, Enter, and Save.
  const coordinateValidators = [
    (value: Stringy) =>
      getLiveCoordinateEntryError(String(value ?? ""), coordinateContext) ?? undefined,
  ];
  const coordinateText = fieldText.coordinates.trim();
  const coordinateParseError =
    coordinateText && coordinateText !== formattedLocation.trim()
      ? parseCoordinateEntry(coordinateText, coordinateContext).error
      : null;
  // Shown under the field: the full-parse error from the last blur, Enter, or Save, else the live one.
  const [coordinateSubmitError, setCoordinateSubmitError] = useState<string | null>(null);
  const coordinateError =
    coordinateSubmitError ?? getFieldTextError(coordinateValidators, fieldText.coordinates);
  useEffect(() => setCoordinateSubmitError(null), [formattedLocation]);

  const petError = getFieldTextError(PET_VALIDATORS, fieldText.pet);
  // Coordinate errors are shown under their field, not in the Save tooltip.
  const otherFieldError =
    getFieldTextError(NAME_VALIDATORS, fieldText.name) ||
    getFieldTextError(RADIUS_VALIDATORS, fieldText.radius) ||
    petError ||
    getFieldTextError(NOTES_VALIDATORS, fieldText.notes);

  const rexes = useMissionDocSelector((m) => m.rexes, refEqual);
  const hasRunningRex = Object.values(rexes ?? {}).some((rex) => rex.isRunning);
  const currentPetAvailable =
    getCurrentAssetPet({ rexes }, getAccurateNow().getTime()).petSeconds !== null;

  const [saving, setSaving] = useState(false);
  const saveEnabled =
    editable && !otherFieldError && !coordinateError && !coordinateParseError && !saving;
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const closeEmojiPicker = useCallback(() => setEmojiAnchor(null), []);

  // Commits the coordinate text to the Redux preview; false when it does not parse.
  const submitCoordinates = () => {
    if (coordinateText === formattedLocation.trim()) {
      setText("coordinates", formattedLocation);
      setCoordinateSubmitError(null);
      return true;
    }
    const result = coordinateText
      ? parseCoordinateEntry(coordinateText, coordinateContext)
      : { location: null, error: null };
    setCoordinateSubmitError(result.error);
    if (result.error) return false;
    dispatch(thunkCancelAssetMapDirective());
    dispatch(thunkSetAssetEditLocation({ uuid: assetUuid, location: result.location }));
    return true;
  };

  const save = async () => {
    if (!submitCoordinates() || !saveEnabled) return;
    setSaving(true);
    try {
      await dispatch(thunkSaveAssetEdit());
    } finally {
      setSaving(false);
    }
  };

  const startMapDirective = () => {
    dispatch(thunkStartAssetMapDirective());
  };

  const actions = (
    <div className={styles.editorActions}>
      <Button
        onClick={save}
        icon={faFloppyDisk}
        ariaLabel="Save"
        toolTip={
          saving
            ? inEdit?.elevationPending
              ? "Waiting for elevation…"
              : "Saving…"
            : otherFieldError || "Save"
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
        <div className={styles.editorHeading}>{inEdit.isNew ? "Add Asset" : "Edit Asset"}</div>
        {actions}
      </div>

      <div className={styles.editorForm}>
        <span className={styles.fieldLabel}>Name *</span>
        <div className={styles.fieldControls}>
          <EmojiRenderer iconValue={values.icon || DEFAULT_ASSET_ICON} />
          <Button
            label={emojiAnchor ? "Close" : "Pick Icon"}
            className={styles.editorButton}
            enabled={editable}
            onClick={(e) => setEmojiAnchor(emojiAnchor ? null : e.currentTarget)}
          />
          <InLineEditInput
            value={fieldText.name}
            editing={editable}
            debounceSubmit={false}
            styleContainer={GROW_INPUT_CONTAINER_STYLE}
            onSubmit={(name) => dispatch(updateAssetInEditValues({ name }))}
            fieldProps={{
              name: "name",
              ariaLabel: "Asset name",
              className: styles.growInput,
              validators: NAME_VALIDATORS,
              inputProps: {
                placeholder: "Required",
                "data-testid": "asset-editor-name",
                maxLength: ASSET_NAME_MAX_LENGTH,
              },
              onValueChange: (text) => setText("name", text),
            }}
          />
        </div>

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
          <InLineEditInput
            value={fieldText.radius}
            editing={editable}
            debounceSubmit={false}
            onSubmit={(text) =>
              dispatch(updateAssetInEditValues({ uncertaintyMeters: Number(text) }))
            }
            fieldProps={{
              name: "radius",
              ariaLabel: "Radius in meters",
              className: styles.numberInput,
              validators: RADIUS_VALIDATORS,
              inputProps: {
                inputMode: "decimal",
                "data-testid": "asset-editor-uncertainty",
              },
              onValueChange: (text) => setText("radius", text),
              onBlur: () => {
                if (!fieldText.radius.trim()) setText("radius", "0");
              },
            }}
          />
          <span className={`${styles.fieldLabel} ${styles.inlineFieldLabel}`}>Radius color</span>
          <div data-testid="asset-editor-color">
            <PathColorPickerMenu
              circular={true}
              currentColor={getAssetColor(values)}
              editMode={editable}
              updateColor={(color) => dispatch(updateAssetInEditValues({ color }))}
            />
          </div>
          {values.color ? (
            <Button
              onClick={() => dispatch(updateAssetInEditValues({ color: null }))}
              icon={faXmark}
              label="Reset"
              ariaLabel="Reset radius color"
              className={styles.editorButton}
              enabled={editable}
            />
          ) : (
            <span className={styles.fieldNote}>Default</span>
          )}
        </div>

        <span className={styles.fieldLabel}>Position</span>
        <div className={styles.fieldControls}>
          <InLineEditInput
            value={fieldText.coordinates}
            editing={editable}
            debounceSubmit={false}
            styleContainer={GROW_INPUT_CONTAINER_STYLE}
            fieldProps={{
              name: "coordinates",
              ariaLabel: "Asset coordinates",
              className: styles.growInput,
              validators: coordinateValidators,
              inputProps: {
                placeholder: getCoordinateEntryHint(coordinateContext),
                "data-testid": "asset-editor-coordinates",
                onKeyDown: (e) => {
                  if (e.key === "Enter") submitCoordinates();
                  if (e.key === "Escape") {
                    setText("coordinates", formattedLocation);
                    setCoordinateSubmitError(null);
                  }
                },
              },
              onValueChange: (text) => {
                setText("coordinates", text);
                setCoordinateSubmitError(null);
              },
              onBlur: submitCoordinates,
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
            className={`${styles.fieldNote} ${styles.fieldValueColumn}`}
            data-testid="asset-editor-map-directive-hint"
          >
            Click the map to place the asset.
          </div>
        )}

        {!inEdit.isNew && <AssetPetSource rexUuid={values.rexUuid} />}
        <span className={styles.fieldLabel}>PET</span>
        <div className={styles.petControls}>
          <InLineEditInput
            value={fieldText.pet}
            editing={editable}
            debounceSubmit={false}
            onSubmit={(text) =>
              dispatch(updateAssetInEditValues({ petSeconds: parseAssetPetSeconds(text) }))
            }
            fieldProps={{
              name: "pet",
              ariaLabel: "Asset PET",
              className: styles.petInput,
              validators: PET_VALIDATORS,
              inputProps: {
                placeholder: "+HH:MM:SS",
                "data-testid": "asset-editor-pet",
              },
              onValueChange: (text) => setText("pet", text),
              onBlur: () => {
                if (!petError) setText("pet", formattedPet);
              },
            }}
          />
          {hasRunningRex && (
            <Button
              label="Set to current PET"
              className={styles.editorButton}
              enabled={editable && currentPetAvailable}
              toolTip={currentPetAvailable ? undefined : "No running REX with a valid PET"}
              onClick={() => {
                const pet = getCurrentAssetPet({ rexes }, getAccurateNow().getTime());
                if (pet.petSeconds === null) return;
                setText("pet", hhmmssFromSeconds(pet.petSeconds));
                dispatch(setAssetInEditPet(pet));
              }}
            />
          )}
        </div>

        <span className={`${styles.fieldLabel} ${styles.notesLabel}`}>Notes</span>
        <TextArea
          value={fieldText.notes}
          editing={editable}
          debounceSubmit={false}
          onSubmit={(notes) => dispatch(updateAssetInEditValues({ notes: notes || null }))}
          fieldProps={{
            name: "notes",
            ariaLabel: "Asset notes",
            style: NOTES_TEXT_AREA_STYLE,
            validators: NOTES_VALIDATORS,
            inputProps: {
              placeholder: "Optional",
              maxLength: ASSET_NOTES_MAX_LENGTH,
              "data-testid": "asset-editor-notes",
              rows: 3,
            },
            onValueChange: (text) => setText("notes", text),
          }}
        />
        {asset && (
          <div className={styles.editorLastModified} data-testid="asset-editor-last-modified">
            <span className={styles.fieldLabel}>Last Edited:</span>
            <LastEditedNumeric
              updatedAt={asset.updatedAt}
              createdAt={asset.createdAt}
              info={[["Asset UUID", asset.uuid]]}
            />
          </div>
        )}
      </div>
    </div>
  );
};
