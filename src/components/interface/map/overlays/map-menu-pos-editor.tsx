import type { CSSProperties, FunctionComponent } from "react";
import { useEffect, useState } from "react";
import { faBan, faCrosshairs, faFloppyDisk, faXmark } from "@fortawesome/free-solid-svg-icons";

import { LastEditedNumeric } from "components/interface/_global-elements";
import assetStyles from "./map-menu-assets.module.css";
import posStyles from "./map-menu-pos.module.css";
import { PositionWalkback } from "./map-menu-pos-walkback";
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
  POS_ENTRY_NOTES_MAX_LENGTH,
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

interface PositionEditorFieldText {
  radius: string;
  coordinates: string;
  pet: string;
  notes: string;
}

const RADIUS_VALIDATORS = [
  validators.mustBeNumber,
  validators.minValue(0),
  validators.maxValue(POS_ENTRY_RADIUS_MAX_METERS),
];
const PET_VALIDATORS = [validators.mustBeHHMMSS];
const NOTES_VALIDATORS = [validators.maxLength(POS_ENTRY_NOTES_MAX_LENGTH)];
const GROW_INPUT_CONTAINER_STYLE: CSSProperties = { flex: "1 1 110px", minWidth: 0 };
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
          className={`${assetStyles.editorButton} ${posStyles.toggleButton} ${position} ${isSelected(option.uuid) ? posStyles.toggleSelected : ""}`}
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

// Save commits the Redux draft's changed fields together.
export const PositionEditor: FunctionComponent<PositionEditorProps> = ({
  inEdit,
  rex,
  entry,
  canMutate,
  coordinateContext,
}) => {
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
  const formattedPet = values.petSeconds === null ? "" : hhmmssFromSeconds(values.petSeconds);
  const [fieldText, setFieldText] = useState<PositionEditorFieldText>(() => ({
    radius: String(values.uncertaintyMeters),
    coordinates: formattedLocation,
    pet: formattedPet,
    notes: values.notes ?? "",
  }));
  const setText = (field: keyof PositionEditorFieldText, text: string) =>
    setFieldText((previous) => ({ ...previous, [field]: text }));
  const coordinateText = fieldText.coordinates;
  const radiusText = fieldText.radius;
  const petText = fieldText.pet;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const coordinateValidationError =
    coordinateText.trim() && coordinateText.trim() !== formattedLocation.trim()
      ? parseCoordinateEntry(coordinateText, coordinateContext).error
      : null;
  useEffect(() => {
    setFieldText((previous) => ({ ...previous, coordinates: formattedLocation }));
    setSubmitError(null);
  }, [formattedLocation]);

  useEffect(() => {
    setFieldText((previous) =>
      Number(previous.radius) === values.uncertaintyMeters
        ? previous
        : { ...previous, radius: String(values.uncertaintyMeters) }
    );
  }, [values.uncertaintyMeters]);
  const radiusError =
    composeValidators(...RADIUS_VALIDATORS)(radiusText, {}) ||
    validatePosEntryRadius(Number(radiusText));

  useEffect(() => {
    setFieldText((previous) =>
      parseAssetPetSeconds(previous.pet) === values.petSeconds
        ? previous
        : { ...previous, pet: formattedPet }
    );
  }, [values.petSeconds, formattedPet]);
  const petError = validators.mustBeHHMMSS(petText);
  const notesError = composeValidators(...NOTES_VALIDATORS)(fieldText.notes, {});
  const currentPetAvailable = petSecondsAt(rex, getAccurateNow().getTime()) !== null;

  // Valid typed coordinates count as placed before they are submitted; Save parses them first.
  const typedLocationPending = !!coordinateText.trim() && !coordinateValidationError;
  const invalid = validatePosEntryEditValues(
    { ...values, location: values.location ?? (typedLocationPending ? { lat: 0, lng: 0 } : null) },
    rex
  );
  const [saving, setSaving] = useState(false);
  const saveEnabled =
    editable &&
    !invalid &&
    !petError &&
    !notesError &&
    !coordinateValidationError &&
    !radiusError &&
    !saving;

  const submitCoordinates = () => {
    const text = coordinateText.trim();
    if (text === formattedLocation.trim()) {
      setText("coordinates", formattedLocation);
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
    dispatch(thunkCancelPosEntryMapDirective());
    dispatch(thunkSetPosEntryEditLocation({ uuid: inEdit.uuid, location: result.location }));
    return true;
  };

  const save = async () => {
    if (!submitCoordinates() || !saveEnabled) return;
    setSaving(true);
    try {
      await dispatch(thunkSavePosEntryEdit());
    } finally {
      setSaving(false);
    }
  };

  const coordinateValidators = [
    (value: Stringy) =>
      getLiveCoordinateEntryError(String(value ?? ""), coordinateContext) ?? undefined,
  ];

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
            onClick={save}
            icon={faFloppyDisk}
            ariaLabel="Save"
            toolTip={
              saving
                ? inEdit.elevationPending
                  ? "Waiting for elevation…"
                  : "Saving…"
                : petError || notesError || coordinateValidationError || invalid || "Save"
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
        <div className={posStyles.pairedFields}>
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
        </div>

        <span className={assetStyles.fieldLabel}>Radius (m)</span>
        <div className={assetStyles.fieldControls}>
          <InLineEditInput
            value={radiusText}
            editing={editable}
            debounceSubmit={false}
            onSubmit={(text) =>
              dispatch(updatePosEntryInEditValues({ uncertaintyMeters: Number(text) }))
            }
            fieldProps={{
              name: "radius",
              ariaLabel: "Radius in meters",
              className: assetStyles.numberInput,
              validators: RADIUS_VALIDATORS,
              inputProps: {
                inputMode: "decimal",
                "data-testid": "position-editor-uncertainty",
                "aria-invalid": !!radiusError,
                "aria-describedby": radiusError ? "position-radius-error" : undefined,
              },
              onValueChange: (text) => setText("radius", text),
              onBlur: () => {
                if (!radiusText.trim()) setText("radius", "0");
              },
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

        <span className={assetStyles.fieldLabel}>
          Position ({coordinateContext.usingLGRSCoordinates ? "LGRS" : "Lat/Lng"}) *
        </span>
        <div className={assetStyles.fieldControls}>
          <InLineEditInput
            value={coordinateText}
            editing={editable}
            debounceSubmit={false}
            styleContainer={GROW_INPUT_CONTAINER_STYLE}
            fieldProps={{
              name: "coordinates",
              ariaLabel: "Position coordinates",
              className: assetStyles.growInput,
              validators: coordinateValidators,
              inputProps: {
                placeholder: getCoordinateEntryHint(coordinateContext),
                "data-testid": "position-editor-coordinates",
                onKeyDown: (e) => {
                  if (e.key === "Enter") submitCoordinates();
                  if (e.key === "Escape") {
                    setText("coordinates", formattedLocation);
                    setSubmitError(null);
                  }
                },
              },
              onValueChange: (text) => {
                setText("coordinates", text);
                setSubmitError(null);
              },
              onBlur: submitCoordinates,
            }}
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
        {coordinateContext.usingLGRSCoordinates && values.location && (
          <span className={assetStyles.fieldLabel}>Lat/Lng</span>
        )}
        {(values.location || inEdit.elevationPending) && (
          <div className={`${assetStyles.fieldNote} ${assetStyles.fieldValueColumn}`}>
            {coordinateContext.usingLGRSCoordinates && values.location && (
              <span>{formatLatLng(values.location)}</span>
            )}
            <span data-testid="position-editor-elevation">
              Elev (m){" "}
              {inEdit.elevationPending
                ? "Fetching…"
                : values.elevation !== null
                  ? values.elevation.toFixed(1)
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
          <InLineEditInput
            value={petText}
            editing={editable}
            debounceSubmit={false}
            onSubmit={(text) =>
              dispatch(updatePosEntryInEditValues({ petSeconds: parseAssetPetSeconds(text) }))
            }
            fieldProps={{
              name: "pet",
              ariaLabel: "Position PET",
              className: assetStyles.petInput,
              validators: PET_VALIDATORS,
              inputProps: {
                placeholder: "+HH:MM:SS",
                "data-testid": "position-editor-pet",
                "aria-invalid": !!petError,
                "aria-describedby": petError ? "position-pet-error" : undefined,
              },
              onValueChange: (text) => setText("pet", text),
              onBlur: () => {
                if (!petError) setText("pet", formattedPet);
              },
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
              setText("pet", hhmmssFromSeconds(petSeconds));
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

        <span className={`${assetStyles.fieldLabel} ${assetStyles.notesLabel}`}>Notes</span>
        <TextArea
          value={fieldText.notes}
          editing={editable}
          debounceSubmit={false}
          onSubmit={(notes) => dispatch(updatePosEntryInEditValues({ notes: notes || null }))}
          fieldProps={{
            name: "notes",
            ariaLabel: "Position notes",
            style: NOTES_TEXT_AREA_STYLE,
            validators: NOTES_VALIDATORS,
            inputProps: {
              placeholder: "Optional",
              maxLength: POS_ENTRY_NOTES_MAX_LENGTH,
              "data-testid": "position-editor-notes",
              rows: 3,
            },
            onValueChange: (text) => setText("notes", text),
          }}
        />
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
