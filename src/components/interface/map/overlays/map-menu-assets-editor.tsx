import type { FunctionComponent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Form, useForm, useFormState } from "react-final-form";
import { PickerPopover } from "components/interface/form/PickerPopover";
import { faBan, faCrosshairs, faFloppyDisk, faXmark } from "@fortawesome/free-solid-svg-icons";

import { LastEditedNumeric } from "components/interface/_global-elements";
import { AssetPetSource } from "./map-menu-asset-details";
import styles from "./map-menu-assets.module.css";
import {
  Button,
  FFInput,
  FFTextArea,
  PathColorPickerMenu,
} from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
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

interface AssetEditorProps {
  inEdit: AssetInEdit;
  asset?: Asset;
  canMutate: boolean;
  coordinateContext: CoordinateEntryContext;
}

interface AssetFormValues {
  name: string;
  radius: string;
  coordinates: string;
  pet: string;
  notes: string;
}

// Save commits the Redux preview's changed fields together.
export const AssetEditor: FunctionComponent<AssetEditorProps> = (props) => {
  const values = props.inEdit.values;
  const dispatch = useAppDispatch();
  return (
    <Form<AssetFormValues>
      initialValues={{
        name: values.name,
        radius: String(values.uncertaintyMeters),
        coordinates: formatCoordinateEntry(values.location, props.coordinateContext),
        pet: values.petSeconds === null ? "" : hhmmssFromSeconds(values.petSeconds),
        notes: values.notes ?? "",
      }}
      keepDirtyOnReinitialize={true}
      onSubmit={async (fields) => {
        const text = (fields.coordinates ?? "").trim();
        const formatted = formatCoordinateEntry(values.location, props.coordinateContext).trim();
        if (text !== formatted) {
          const result = text
            ? parseCoordinateEntry(text, props.coordinateContext)
            : { location: null, error: null };
          if (result.error) return { coordinates: result.error };
          dispatch(thunkCancelAssetMapDirective());
          dispatch(
            thunkSetAssetEditLocation({ uuid: props.inEdit.uuid, location: result.location })
          );
        }
        await dispatch(thunkSaveAssetEdit());
      }}
      subscription={{}}
      render={() => <AssetEditorFields {...props} />}
    />
  );
};

const AssetEditorFields: FunctionComponent<AssetEditorProps> = ({
  inEdit,
  asset,
  canMutate,
  coordinateContext,
}) => {
  const form = useForm<AssetFormValues>();
  const {
    values: textValues,
    invalid: formInvalid,
    submitting: saving,
  } = useFormState<AssetFormValues>({
    subscription: { values: true, invalid: true, submitting: true },
  });
  const coordinateText = textValues.coordinates ?? "";
  const uncertaintyText = textValues.radius ?? "";
  const petText = textValues.pet ?? "";
  const setCoordinateText = (value: string) => form.change("coordinates", value);
  const setUncertaintyText = (value: string) => form.change("radius", value);
  const setPetText = (value: string) => form.change("pet", value);
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

  const invalid = validateAssetEditValues({ ...values, name: values.name.trim() });
  const nameError = validateAssetName(values.name);
  const notesError = validateAssetNotes(values.notes);

  const formattedLocation = formatCoordinateEntry(values.location, coordinateContext);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const coordinateValidationError =
    coordinateText.trim() && coordinateText.trim() !== formattedLocation.trim()
      ? parseCoordinateEntry(coordinateText, coordinateContext).error
      : null;
  useEffect(() => {
    form.change("coordinates", formattedLocation);
    setSubmitError(null);
  }, [form, formattedLocation]);

  useEffect(() => {
    const current = form.getState().values.radius;
    if (Number(current) !== values.uncertaintyMeters)
      form.change("radius", String(values.uncertaintyMeters));
  }, [form, values.uncertaintyMeters]);
  const uncertaintyError = validateAssetRadius(Number(uncertaintyText));
  const uncertaintyValid = !uncertaintyError;

  const formattedPet = values.petSeconds === null ? "" : hhmmssFromSeconds(values.petSeconds);
  const rexes = useMissionDocSelector((m) => m.rexes, refEqual);
  const hasRunningRex = Object.values(rexes ?? {}).some((rex) => rex.isRunning);
  const currentPetAvailable =
    getCurrentAssetPet({ rexes }, getAccurateNow().getTime()).petSeconds !== null;
  useEffect(() => {
    const current = form.getState().values.pet ?? "";
    if (parseAssetPetSeconds(current) !== values.petSeconds) form.change("pet", formattedPet);
  }, [form, values.petSeconds, formattedPet]);
  const petError = validators.mustBeHHMMSS(petText);

  const saveEnabled =
    editable &&
    !formInvalid &&
    !invalid &&
    !petError &&
    !coordinateValidationError &&
    uncertaintyValid &&
    !saving;
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
    dispatch(thunkStartAssetMapDirective());
  };

  const actions = (
    <div className={styles.editorActions}>
      <Button
        onClick={() => {
          form.submit();
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
        <div className={styles.editorHeading}>{inEdit.isNew ? "Add Asset" : "Edit Asset"}</div>
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
            <FFInput
              name="name"
              ariaLabel="Asset name"
              className={`${styles.editorInput} ${styles.growInput}`}
              validators={[(value) => validateAssetName(String(value ?? "")) ?? undefined]}
              inputProps={{
                placeholder: "Required",
                "data-testid": "asset-editor-name",
                disabled: !editable,
                maxLength: ASSET_NAME_MAX_LENGTH,
                "aria-invalid": !!nameError,
                "aria-describedby": nameError ? "asset-name-error" : undefined,
              }}
              onValueChange={(name) => dispatch(updateAssetInEditValues({ name }))}
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
          <FFInput
            name="radius"
            ariaLabel="Radius in meters"
            className={`${styles.editorInput} ${styles.numberInput}`}
            classNameError={styles.editorInputError}
            validators={[
              validators.mustBeNumber,
              validators.minValue(0),
              validators.maxValue(ASSET_RADIUS_MAX_METERS),
            ]}
            inputProps={{
              inputMode: "decimal",
              "data-testid": "asset-editor-uncertainty",
              disabled: !editable,
              "aria-invalid": !!uncertaintyError,
              "aria-describedby": uncertaintyError ? "asset-radius-error" : undefined,
            }}
            onValueChange={(text) => {
              const parsed = Number(text);
              if (!validateAssetRadius(parsed))
                dispatch(updateAssetInEditValues({ uncertaintyMeters: parsed }));
            }}
            onBlur={() => {
              if (!uncertaintyText.trim()) setUncertaintyText("0");
            }}
          />
          <span className={`${styles.fieldLabel} ${styles.inlineFieldLabel}`}>Radius color</span>
          <div data-testid="asset-editor-color">
            <PathColorPickerMenu
              circular={true}
              currentColor={values.color}
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
            <span className={styles.fieldNote}>None</span>
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
          <FFInput
            name="coordinates"
            ariaLabel="Asset coordinates"
            className={`${styles.editorInput} ${styles.growInput} ${coordinateError ? styles.editorInputError : ""}`}
            validators={[
              (value) =>
                getLiveCoordinateEntryError(String(value ?? ""), coordinateContext) ?? undefined,
            ]}
            inputProps={{
              placeholder: getCoordinateEntryHint(coordinateContext),
              "data-testid": "asset-editor-coordinates",
              disabled: !editable,
              onKeyDown: (e) => {
                if (e.key === "Enter") submitCoordinates();
                if (e.key === "Escape") {
                  setCoordinateText(formattedLocation);
                  setSubmitError(null);
                }
              },
            }}
            onValueChange={() => setSubmitError(null)}
            onBlur={submitCoordinates}
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
          <FFInput
            name="pet"
            ariaLabel="Asset PET"
            className={`${styles.editorInput} ${styles.petInput}`}
            classNameError={styles.editorInputError}
            validators={[validators.mustBeHHMMSS]}
            inputProps={{
              placeholder: "+HH:MM:SS",
              "data-testid": "asset-editor-pet",
              disabled: !editable,
              "aria-invalid": !!petError,
              "aria-describedby": petError ? "asset-pet-error" : undefined,
            }}
            onValueChange={(text) => {
              const seconds = parseAssetPetSeconds(text);
              if (!text.trim() || seconds !== null)
                dispatch(updateAssetInEditValues({ petSeconds: seconds }));
            }}
            onBlur={() => {
              if (!petError) setPetText(formattedPet);
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
                setPetText(hhmmssFromSeconds(pet.petSeconds));
                dispatch(setAssetInEditPet(pet));
              }}
            />
          )}
        </div>
        {petError && (
          <div
            id="asset-pet-error"
            className={`${styles.fieldError} ${styles.fieldValueColumn}`}
            data-testid="asset-editor-pet-error"
          >
            {petError}
          </div>
        )}

        <span className={`${styles.fieldLabel} ${styles.notesLabel}`}>Notes</span>
        <FFTextArea
          name="notes"
          ariaLabel="Asset notes"
          className={`${styles.editorInput} ${styles.editorNotes}`}
          validators={[validators.maxLength(ASSET_NOTES_MAX_LENGTH)]}
          inputProps={{
            placeholder: "Optional",
            maxLength: ASSET_NOTES_MAX_LENGTH,
            "data-testid": "asset-editor-notes",
            disabled: !editable,
            rows: 3,
            "aria-invalid": !!notesError,
            "aria-describedby": notesError ? "asset-notes-error" : undefined,
          }}
          onValueChange={(notes) => dispatch(updateAssetInEditValues({ notes: notes || null }))}
        />
        {notesError && (
          <div id="asset-notes-error" className={`${styles.fieldError} ${styles.fieldValueColumn}`}>
            {notesError}
          </div>
        )}
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
