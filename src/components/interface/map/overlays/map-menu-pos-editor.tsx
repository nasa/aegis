import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import { Form, useForm, useFormState } from "react-final-form";
import { faBan, faCrosshairs, faFloppyDisk, faXmark } from "@fortawesome/free-solid-svg-icons";

import { LastEditedNumeric } from "components/interface/_global-elements";
import assetStyles from "./map-menu-assets.module.css";
import posStyles from "./map-menu-pos.module.css";
import { PositionWalkback } from "./map-menu-pos-walkback";
import { Button, FFInput, PathColorPickerMenu } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { updatePosEntryInEditValues } from "store/rex";
import {
  thunkCancelPosEntryEdit,
  thunkCancelPosEntryMapDirective,
  thunkSavePosEntryEdit,
  thunkSetPosEntryEditLocation,
  thunkStartPosEntryMapDirective,
} from "store/thunk/thunkRexPosEntry";
import { parseAssetPetSeconds } from "utils/assets";
import {
  POS_ENTRY_RADIUS_MAX_METERS,
  validatePosEntryEditValues,
  validatePosEntryRadius,
} from "utils/posEntries";
import {
  formatCoordinateEntry,
  formatLatLng,
  getCoordinateEntryHint,
  getLiveCoordinateEntryError,
  parseCoordinateEntry,
} from "utils/coordinateEntry";
import { getAccurateNow, hhmmssFromSeconds, petSecondsAt } from "utils/formatting";

interface PositionEditorProps {
  inEdit: PosEntryInEdit;
  rex: Rex;
  entry?: PosEntry;
  canMutate: boolean;
  coordinateContext: CoordinateEntryContext;
}

interface PositionFormValues {
  radius: string;
  coordinates: string;
  pet: string;
}

// Save commits the Redux draft's changed fields together.
export const PositionEditor: FunctionComponent<PositionEditorProps> = (props) => {
  const values = props.inEdit.values;
  const dispatch = useAppDispatch();
  return (
    <Form<PositionFormValues>
      initialValues={{
        radius: String(values.uncertaintyMeters),
        coordinates: formatCoordinateEntry(values.location, props.coordinateContext),
        pet: values.petSeconds === null ? "" : hhmmssFromSeconds(values.petSeconds),
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
          dispatch(thunkCancelPosEntryMapDirective());
          dispatch(
            thunkSetPosEntryEditLocation({ uuid: props.inEdit.uuid, location: result.location })
          );
        }
        await dispatch(thunkSavePosEntryEdit());
      }}
      subscription={{}}
      render={() => <PositionEditorFields {...props} />}
    />
  );
};

/** Segmented toggle buttons for pos types (multi-select) or pos sources (single-select). */
const ToggleGroup: FunctionComponent<{
  label: string;
  options: { uuid: string; abbr: string; name: string }[];
  isSelected: (uuid: string) => boolean;
  onToggle: (uuid: string) => void;
  enabled: boolean;
  testId: string;
}> = ({ label, options, isSelected, onToggle, enabled, testId }) => (
  <div className={posStyles.toggleGroup} role="group" aria-label={label} data-testid={testId}>
    {options.map((option, index) => {
      const position =
        options.length === 1
          ? posStyles.toggleOnly
          : index === 0
            ? posStyles.toggleLeft
            : index === options.length - 1
              ? posStyles.toggleRight
              : posStyles.toggleMiddle;
      return (
        <button
          key={option.uuid}
          type="button"
          className={`${posStyles.toggleButton} ${position} ${isSelected(option.uuid) ? posStyles.toggleSelected : ""}`}
          aria-pressed={isSelected(option.uuid)}
          aria-label={option.name}
          disabled={!enabled}
          onClick={() => onToggle(option.uuid)}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-content={option.name}
        >
          {option.abbr}
        </button>
      );
    })}
  </div>
);

const PositionEditorFields: FunctionComponent<PositionEditorProps> = ({
  inEdit,
  rex,
  entry,
  canMutate,
  coordinateContext,
}) => {
  const form = useForm<PositionFormValues>();
  const {
    values: textValues,
    invalid: formInvalid,
    submitting: saving,
  } = useFormState<PositionFormValues>({
    subscription: { values: true, invalid: true, submitting: true },
  });
  const coordinateText = textValues.coordinates ?? "";
  const radiusText = textValues.radius ?? "";
  const petText = textValues.pet ?? "";
  const dispatch = useAppDispatch();
  const values = inEdit.values;
  const editable = canMutate;
  const mapAction = useAppSelector(
    (s) =>
      s.map.mapDirective?.mapItemType === "posEntry" && s.map.mapDirective.uuid === inEdit.uuid
        ? s.map.mapDirective.mapAction
        : null,
    refEqual
  );
  const mapDirectiveActive = mapAction === "createMarker" || mapAction === "editMarker";

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
  const radiusError = validatePosEntryRadius(Number(radiusText));

  const formattedPet = values.petSeconds === null ? "" : hhmmssFromSeconds(values.petSeconds);
  useEffect(() => {
    const current = form.getState().values.pet ?? "";
    if (parseAssetPetSeconds(current) !== values.petSeconds) form.change("pet", formattedPet);
  }, [form, values.petSeconds, formattedPet]);
  const petError = validators.mustBeHHMMSS(petText);
  const currentPetAvailable = petSecondsAt(rex, getAccurateNow().getTime()) !== null;

  // Valid typed coordinates count as placed before they are submitted; Save parses them first.
  const typedLocationPending = !!coordinateText.trim() && !coordinateValidationError;
  const invalid = validatePosEntryEditValues(
    { ...values, location: values.location ?? (typedLocationPending ? { lat: 0, lng: 0 } : null) },
    rex
  );
  const saveEnabled =
    editable &&
    !formInvalid &&
    !invalid &&
    !petError &&
    !coordinateValidationError &&
    !radiusError &&
    !saving;

  const submitCoordinates = () => {
    const text = coordinateText.trim();
    if (text === formattedLocation.trim()) {
      form.change("coordinates", formattedLocation);
      setSubmitError(null);
      return;
    }
    const result = text
      ? parseCoordinateEntry(text, coordinateContext)
      : { location: null, error: null };
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    setSubmitError(null);
    dispatch(thunkCancelPosEntryMapDirective());
    dispatch(thunkSetPosEntryEditLocation({ uuid: inEdit.uuid, location: result.location }));
  };

  // Live validation while typing; the authoritative submit check reports on blur/Enter.
  const coordinateError =
    submitError ?? getLiveCoordinateEntryError(coordinateText, coordinateContext);

  const togglePosType = (uuid: string) => {
    const selected = values.posTypeUuids.includes(uuid);
    dispatch(
      updatePosEntryInEditValues({
        posTypeUuids: selected
          ? values.posTypeUuids.filter((typeUuid) => typeUuid !== uuid)
          : [...values.posTypeUuids, uuid],
      })
    );
  };

  return (
    <div className={assetStyles.editor} data-testid="position-editor">
      <div className={assetStyles.editorHeader}>
        <div className={assetStyles.editorHeading}>
          {inEdit.isNew ? "Add Position" : "Edit Position"}
        </div>
        <div className={assetStyles.editorActions}>
          <Button
            onClick={() => form.submit()}
            icon={faFloppyDisk}
            ariaLabel="Save"
            toolTip={
              saving
                ? inEdit.elevationPending
                  ? "Waiting for elevation…"
                  : "Saving…"
                : petError || coordinateValidationError || invalid || "Save"
            }
            className={`${assetStyles.iconOnlyButton} ${saveEnabled ? assetStyles.saveButton : assetStyles.saveButtonDisabled}`}
            enabled={saveEnabled}
          />
          <Button
            onClick={() => dispatch(thunkCancelPosEntryEdit())}
            icon={faBan}
            ariaLabel="Cancel"
            toolTip="Cancel"
            className={assetStyles.iconOnlyButton}
          />
        </div>
      </div>

      <div className={assetStyles.editorForm}>
        <span className={assetStyles.fieldLabel}>Types *</span>
        <div className={assetStyles.fieldControls}>
          <ToggleGroup
            label="Position types"
            options={rex.posTypes ?? []}
            isSelected={(uuid) => values.posTypeUuids.includes(uuid)}
            onToggle={togglePosType}
            enabled={editable}
            testId="position-editor-types"
          />
        </div>

        <span className={assetStyles.fieldLabel}>Source *</span>
        <div className={assetStyles.fieldControls}>
          <ToggleGroup
            label="Position source"
            options={rex.posSources ?? []}
            isSelected={(uuid) => values.posSourceUuid === uuid}
            onToggle={(uuid) => dispatch(updatePosEntryInEditValues({ posSourceUuid: uuid }))}
            enabled={editable}
            testId="position-editor-source"
          />
        </div>

        <span className={assetStyles.fieldLabel}>Radius (m)</span>
        <div className={assetStyles.fieldControls}>
          <FFInput
            name="radius"
            ariaLabel="Radius in meters"
            className={`${assetStyles.editorInput} ${assetStyles.numberInput}`}
            classNameError={assetStyles.editorInputError}
            validators={[
              validators.mustBeNumber,
              validators.minValue(0),
              validators.maxValue(POS_ENTRY_RADIUS_MAX_METERS),
            ]}
            inputProps={{
              inputMode: "decimal",
              "data-testid": "position-editor-uncertainty",
              disabled: !editable,
              "aria-invalid": !!radiusError,
              "aria-describedby": radiusError ? "position-radius-error" : undefined,
            }}
            onValueChange={(text) => {
              const parsed = Number(text);
              if (!validatePosEntryRadius(parsed))
                dispatch(updatePosEntryInEditValues({ uncertaintyMeters: parsed }));
            }}
            onBlur={() => {
              if (!radiusText.trim()) form.change("radius", "0");
            }}
          />
          <span className={`${assetStyles.fieldLabel} ${assetStyles.inlineFieldLabel}`}>
            Radius color
          </span>
          <div data-testid="position-editor-color">
            <PathColorPickerMenu
              circular={true}
              currentColor={values.color}
              editMode={editable}
              updateColor={(color) => dispatch(updatePosEntryInEditValues({ color }))}
            />
          </div>
          {values.color ? (
            <Button
              onClick={() => dispatch(updatePosEntryInEditValues({ color: null }))}
              icon={faXmark}
              label="Clear"
              ariaLabel="Clear radius color"
              className={assetStyles.editorButton}
              enabled={editable}
            />
          ) : (
            <span className={assetStyles.fieldNote}>None</span>
          )}
        </div>
        {radiusError && (
          <div
            id="position-radius-error"
            className={`${assetStyles.fieldError} ${assetStyles.fieldValueColumn}`}
          >
            {radiusError}
          </div>
        )}

        <span className={assetStyles.fieldLabel}>Position *</span>
        <div className={assetStyles.fieldControls}>
          <FFInput
            name="coordinates"
            ariaLabel="Position coordinates"
            className={`${assetStyles.editorInput} ${assetStyles.growInput} ${coordinateError ? assetStyles.editorInputError : ""}`}
            validators={[
              (value) =>
                getLiveCoordinateEntryError(String(value ?? ""), coordinateContext) ?? undefined,
            ]}
            inputProps={{
              placeholder: getCoordinateEntryHint(coordinateContext),
              "data-testid": "position-editor-coordinates",
              disabled: !editable,
              onKeyDown: (e) => {
                if (e.key === "Enter") submitCoordinates();
                if (e.key === "Escape") {
                  form.change("coordinates", formattedLocation);
                  setSubmitError(null);
                }
              },
            }}
            onValueChange={() => setSubmitError(null)}
            onBlur={submitCoordinates}
          />
          {mapDirectiveActive ? (
            <Button
              onClick={() => dispatch(thunkCancelPosEntryMapDirective())}
              icon={faBan}
              label="Cancel Pos."
              className={assetStyles.editorButton}
            />
          ) : (
            <Button
              onClick={() => dispatch(thunkStartPosEntryMapDirective())}
              icon={faCrosshairs}
              label={values.location ? "Edit Pos." : "Place on Map"}
              className={assetStyles.editorButton}
              iconStyle={{ marginRight: 2 }}
              enabled={editable}
            />
          )}
        </div>
        {(values.location || inEdit.elevationPending) && (
          <div className={`${assetStyles.fieldNote} ${assetStyles.fieldValueColumn}`}>
            {coordinateContext.usingLGRSCoordinates && values.location && (
              <span>{formatLatLng(values.location)}</span>
            )}
            <span data-testid="position-editor-elevation">
              Elev.{" "}
              {inEdit.elevationPending
                ? "Fetching…"
                : values.elevation !== null
                  ? `${values.elevation.toFixed(1)} m`
                  : "—"}
            </span>
          </div>
        )}
        {coordinateError && (
          <div
            className={`${assetStyles.fieldError} ${assetStyles.fieldValueColumn}`}
            data-testid="position-editor-coordinate-error"
          >
            {coordinateError}
          </div>
        )}
        {mapDirectiveActive && (
          <div
            className={`${assetStyles.fieldNote} ${assetStyles.fieldValueColumn}`}
            data-testid="position-editor-map-directive-hint"
          >
            Click the map to place the position.
          </div>
        )}

        <PositionWalkback
          location={values.location}
          evaUuid={rex.evaUuid}
          testIdPrefix="position-editor"
        />

        <span className={assetStyles.fieldLabel}>PET *</span>
        <div className={assetStyles.petControls}>
          <FFInput
            name="pet"
            ariaLabel="Position PET"
            className={`${assetStyles.editorInput} ${assetStyles.petInput}`}
            classNameError={assetStyles.editorInputError}
            validators={[validators.mustBeHHMMSS]}
            inputProps={{
              placeholder: "+HH:MM:SS",
              "data-testid": "position-editor-pet",
              disabled: !editable,
              "aria-invalid": !!petError,
              "aria-describedby": petError ? "position-pet-error" : undefined,
            }}
            onValueChange={(text) => {
              const seconds = parseAssetPetSeconds(text);
              if (!text.trim() || seconds !== null)
                dispatch(updatePosEntryInEditValues({ petSeconds: seconds }));
            }}
            onBlur={() => {
              if (!petError) form.change("pet", formattedPet);
            }}
          />
          <Button
            label="Set to current PET"
            className={assetStyles.editorButton}
            enabled={editable && currentPetAvailable}
            toolTip={currentPetAvailable ? undefined : "This REX has no valid PET"}
            onClick={() => {
              const petSeconds = petSecondsAt(rex, getAccurateNow().getTime());
              if (petSeconds === null) return;
              form.change("pet", hhmmssFromSeconds(petSeconds));
              dispatch(updatePosEntryInEditValues({ petSeconds }));
            }}
          />
        </div>
        {petError && (
          <div
            id="position-pet-error"
            className={`${assetStyles.fieldError} ${assetStyles.fieldValueColumn}`}
            data-testid="position-editor-pet-error"
          >
            {petError}
          </div>
        )}

        {entry && (
          <div className={assetStyles.editorLastModified}>
            <span className={assetStyles.fieldLabel}>Last Edited:</span>
            <LastEditedNumeric
              updatedAt={entry.updatedAt}
              createdAt={entry.createdAt}
              info={[["Position UUID", entry.uuid]]}
            />
          </div>
        )}
      </div>
    </div>
  );
};
