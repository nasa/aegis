import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon, type CSSVariables } from "@fortawesome/react-fontawesome";
import { faCheckSquare, faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import type { FunctionComponent, CSSProperties, ChangeEvent, ReactNode } from "react";
import { useState, useRef, useEffect } from "react";
import { EmojiRenderer } from "components/interface/emojis";
import type { FieldRenderProps } from "react-final-form";
import formStyles from "./globalFields.module.css";
import { Field, Form } from "react-final-form";
import React from "react";
import { composeValidators } from "components/interface/form/formValidators";
import Select from "react-select";
import type { FFTextProps, FFCheckboxProps, FFSelectProps, FFTextAreaProps } from "typings/form";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import CircularSlider from "@fseehawer/react-circular-slider";
import CompactColor from "@uiw/react-color-compact";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import debounce from "lodash/debounce";
import { COLOR_PALATTE } from "utils/consts";

export const Button: FunctionComponent<{
  onClick: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  label?: string;
  ariaLabel?: string;
  toolTip?: string;
  icon?: IconDefinition;
  style?: CSSProperties;
  className?: string;
  labelStyle?: CSSProperties;
  size?: "xs" | "lg";
  enabled?: boolean;
  iconStyle?: CSSProperties & CSSVariables;
}> = ({
  onClick,
  label,
  ariaLabel,
  toolTip,
  icon,
  style,
  className,
  labelStyle,
  size,
  enabled = true,
  iconStyle,
}) => {
  const enabledStyle = !enabled ? formStyles.buttonDisabled : "";
  return (
    <div
      className={`${formStyles.button} ${className} ${enabledStyle} `}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-content={toolTip}
      onClick={(e) => {
        if (enabled) onClick(e);
      }}
      style={style}
      aria-label={ariaLabel || label || ""}
    >
      {icon && (
        <FontAwesomeIcon
          icon={icon}
          size={size}
          className={formStyles.buttonLabelIcon}
          style={iconStyle}
        />
      )}
      <div style={labelStyle}>{label}</div>
    </div>
  );
};

export const TextboxButton: FunctionComponent<{
  onMouseDown: (event: React.MouseEvent) => void;
  active?: boolean;
  whiteOnToggle?: boolean;
  label?: string;
  toolTip?: string;
  icon?: IconDefinition;
  style?: CSSProperties;
  labelStyle?: CSSProperties;
  enabled?: boolean;
}> = ({
  onMouseDown,
  active,
  whiteOnToggle,
  label,
  toolTip,
  icon,
  style,
  labelStyle,
  enabled = true,
}) => {
  const enabledStyle = !enabled ? formStyles.iconButtonDisabled : "";
  return (
    <div
      className={`${formStyles.textboxButton} ${enabledStyle} ${
        active
          ? !whiteOnToggle
            ? formStyles.textboxActiveGrey
            : formStyles.textboxActiveWhite
          : ""
      }`}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-content={toolTip}
      onMouseDown={(e) => {
        onMouseDown(e);
      }}
      style={style}
    >
      {icon && <FontAwesomeIcon icon={icon} size="lg" className={formStyles.buttonLabelIcon} />}
      <div style={labelStyle}>{label}</div>
    </div>
  );
};

export const Dropdown: FunctionComponent<{
  children: ReactNode;
  selected: string | undefined;
  containerStyle?: CSSProperties;
  selectStyle?: CSSProperties;
  selectClassName?: string;
  arrowStyle?: CSSProperties;
  arrowClassName?: string;
  toolTip?: string;
  onChange: (value: string) => void;
}> = ({
  children,
  selected,
  containerStyle,
  selectStyle,
  selectClassName,
  arrowStyle,
  arrowClassName,
  toolTip,
  onChange,
}) => {
  return (
    <div
      className={formStyles.select}
      style={containerStyle}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-content={toolTip}
    >
      <select
        value={selected}
        className={selectClassName}
        style={selectStyle}
        aria-label="dropdown"
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {children}
      </select>
      <div className={`${formStyles.select_arrow} ${arrowClassName}`} style={arrowStyle}>
        <FontAwesomeIcon icon={faChevronDown} size="xs" />
      </div>
    </div>
  );
};

export const IconDropdown: FunctionComponent<{
  items: string[];
  editing: boolean;
  selected: string;
  setSelected: Function;
}> = ({ items, editing, selected, setSelected }) => {
  const [expanded, setExpanded] = useState(false);

  if (!editing) {
    return (
      <div className={formStyles.iconDropdownContainer}>
        <div className={formStyles.iconDropdownModalItemNotEditing}>
          <div className={formStyles.itemIcon}>
            <EmojiRenderer iconValue={selected} />
          </div>
        </div>
      </div>
    );
  } else {
    let selectedItem;
    if (selected) {
      selectedItem = (
        <div
          className={`${formStyles.iconDropdownModalItemSelected} ${
            expanded && formStyles.iconDropdownModalItemSelectedExpanded
          }`}
        >
          <div className={formStyles.itemIcon}>
            <EmojiRenderer iconValue={selected} />
          </div>
        </div>
      );
    } else {
      selectedItem = (
        <div
          className={` ${formStyles.iconDropdownModalItemSelected} ${
            expanded && formStyles.iconDropdownModalItemSelectedExpanded
          }`}
        >
          <div className={formStyles.iconDropdownModalItemLabel}></div>
        </div>
      );
    }

    return (
      <div
        tabIndex={0}
        className={formStyles.iconDropdownContainer}
        onClick={() => setExpanded(!expanded)}
        onBlur={() => {
          setExpanded(false);
        }}
      >
        {selectedItem}
        <span className={formStyles.colorSelectArrow}>
          <FontAwesomeIcon icon={faChevronDown} size="xs" />
        </span>
        {expanded && (
          <div className={formStyles.iconDropdownModalList}>
            {items.map((item, index) => {
              return (
                <div
                  className={formStyles.iconDropdownModalItem}
                  key={`${item}_${index}`}
                  onClick={() => setSelected(item)}
                >
                  <div className={formStyles.itemIcon}>
                    <EmojiRenderer iconValue={item} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
};

export const MultiSelectDropdown: FunctionComponent<{
  items: { label: string; value: string }[];
  selectedItemsValues: string[];
  toggleItem: (itemValue: string) => void;
  titleLabel: string;
  containerStyle?: React.CSSProperties;
  containerClassName?: string;
  headerClassName?: string;
  startOpen?: boolean;
  closeOnBlur?: boolean;
}> = ({
  items,
  selectedItemsValues,
  toggleItem,
  titleLabel,
  containerStyle,
  containerClassName,
  headerClassName,
  startOpen = false,
  closeOnBlur = true,
}) => {
  const [menuOpen, setMenuOpen] = useState(startOpen);
  return (
    <>
      <div
        tabIndex={0}
        className={`${formStyles.multiselectDropdownContainer} ${containerClassName}`}
        style={containerStyle}
        onBlur={() => {
          if (closeOnBlur) setMenuOpen(false);
        }}
      >
        <div
          className={`${formStyles.multiselectDropdownHeader} ${headerClassName}`}
          onClick={() => {
            setMenuOpen(!menuOpen);
          }}
        >
          {titleLabel}
          <FontAwesomeIcon
            icon={menuOpen ? faChevronUp : faChevronDown}
            style={{ width: "15px", color: "var(--grey5)", outline: "none" }}
            tabIndex={0}
          />
        </div>
        {menuOpen && (
          <div className={formStyles.multiselectDropdownItems}>
            {items.map((item) => (
              <div
                key={item.value}
                className={formStyles.multiselectDropdownItem}
                onClick={(e) => {
                  // toggle the selectedItem
                  toggleItem(item.value);
                  e.stopPropagation();
                }}
              >
                {selectedItemsValues.includes(item.value) ? (
                  <FontAwesomeIcon icon={faCheckSquare} style={{ marginRight: "5px" }} />
                ) : (
                  <FontAwesomeIcon icon={faSquare} style={{ marginRight: "5px" }} />
                )}

                <div className={formStyles.multiselectDropdownItemTitle}>{item.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

/**
 * This component wraps the {@link FFInput} component inside a react-final-form {@link Form}
 *    to allow each input to validate and submit individually (no singular save button for the entire page)
 * The onSubmit function is called onchange. This is where the redux store update action should be defined
 * To use validators with this component, import validators from /utils/formValidator.ts and
 *    pass them them in as an array in the fieldProps.validators property.
 * New validators can be added and exported from ./formValidators
 */
export const InLineEditInput: FunctionComponent<{
  value: string | null | undefined;
  editing: boolean;
  fieldProps: FFTextProps;
  styleValue?: CSSProperties;
  styleContainer?: CSSProperties;
  onSubmit?: (value: string) => void;
  toFocus?: boolean;
  debounceSubmit?: boolean; // Set to false for Automerge collaborative editing, true for Redux (default)
}> = ({
  value,
  editing,
  styleValue,
  styleContainer,
  onSubmit,
  fieldProps,
  toFocus,
  debounceSubmit = true,
}) => {
  const valueToShow = value || "";
  // This debounce needs to be disabled for Automerge. It's only being used in the admin section.
  // Once the admin is overhauled this can be reviewed again
  const debouncedSubmitRef = useRef(
    debounceSubmit
      ? debounce((formValue) => {
          if (onSubmit) onSubmit(formValue);
        }, 50)
      : null
  );

  return (
    <div style={styleContainer}>
      {editing && (
        <Form
          //only called if all validation passes
          onSubmit={(formValues) => {
            // final-form omits cleared fields from formValues, yielding undefined.
            // Automerge rejects undefined, so normalize to an empty string.
            const newValue = formValues[fieldProps.name] ?? "";
            if (debounceSubmit && debouncedSubmitRef.current) {
              // Debounced update for Redux
              debouncedSubmitRef.current(newValue);
            } else {
              // Immediate update for Automerge collaborative editing
              if (onSubmit) onSubmit(newValue);
            }
          }}
          initialValues={{ [fieldProps.name]: valueToShow }}
          render={({ handleSubmit, form }) => {
            return (
              <form onSubmit={handleSubmit}>
                <FFInput
                  {...fieldProps}
                  className={formStyles.inLineEditInput + " " + fieldProps.className}
                  classNameError={formStyles.inLineEditInputError}
                  onChange={() => {
                    // Trigger form submission which validates and calls onSubmit if valid
                    form.submit();
                  }}
                  toFocus={toFocus}
                />
              </form>
            );
          }}
        />
      )}
      {!editing && (
        <div
          className={formStyles.inLineEditValue}
          style={styleValue}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-content={fieldProps.ariaLabel}
          aria-label={fieldProps.ariaLabel}
        >
          {valueToShow}
        </div>
      )}
    </div>
  );
};

export const TextArea: FunctionComponent<{
  value: string;
  editing: boolean;
  fieldProps: FFTextAreaProps;
  styleValue?: CSSProperties;
  styleContainer?: CSSProperties;
  onSubmit?: (value: string) => void;
  debounceSubmit?: boolean; // Set to false for Automerge collaborative editing, true for Redux (default)
}> = ({
  value,
  editing,
  styleValue,
  styleContainer,
  onSubmit,
  fieldProps,
  debounceSubmit = true,
}) => {
  // This debounce needs to be disabled for Automerge. It's only being used in the admin section.
  // Once the admin is overhauled this can be reviewed again
  const debouncedSubmitRef = useRef(
    debounceSubmit
      ? debounce((formValue) => {
          if (onSubmit) onSubmit(formValue);
        }, 50)
      : null
  );

  return (
    <div style={styleContainer}>
      {editing && (
        <Form
          //only called if all validation passes
          onSubmit={(formValues) => {
            // final-form omits cleared fields from formValues, yielding undefined.
            // Automerge rejects undefined, so normalize to an empty string.
            const newValue = formValues[fieldProps.name] ?? "";
            if (debounceSubmit && debouncedSubmitRef.current) {
              // Debounced update for Redux
              debouncedSubmitRef.current(newValue);
            } else {
              // Immediate update for Automerge collaborative editing
              if (onSubmit) onSubmit(newValue);
            }
          }}
          initialValues={{ [fieldProps.name]: value }}
          render={({ handleSubmit, form }) => {
            return (
              <form onSubmit={handleSubmit}>
                <FFTextArea
                  className={formStyles.textArea}
                  classNameError={formStyles.textAreaError}
                  onChange={() => {
                    // Trigger form submission which validates and calls onSubmit if valid
                    form.submit();
                  }}
                  {...fieldProps}
                />
              </form>
            );
          }}
        />
      )}
      {!editing && (
        <div className={formStyles.textAreaValue} style={styleValue}>
          {value}
        </div>
      )}
    </div>
  );
};

export const Checkbox: FunctionComponent<{
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClick?: (event: React.MouseEvent) => void;
  editable?: boolean;
  toolTip?: string;
  label?: string | ReactNode;
  labelStyle?: CSSProperties;
  labelClassName?: string;
  labelPlacement?: "left" | "right";
  uniqueId?: string;
}> = ({
  checked,
  editable = true,
  onChange,
  onClick,
  toolTip,
  label,
  labelStyle,
  labelClassName,
  labelPlacement = "right",
  uniqueId,
}) => {
  const editableStyle = editable ? "null" : formStyles.notEditable;

  return (
    <div
      className={`${formStyles.checkboxContainer} ${editableStyle}`}
      onClick={onClick}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-content={toolTip}
    >
      {labelPlacement === "left" ? (
        <label
          style={{ ...labelStyle, cursor: "pointer" }}
          className={labelClassName}
          htmlFor={uniqueId}
        >
          {label}
        </label>
      ) : (
        <></>
      )}
      <input
        type="checkbox"
        aria-label="checkbox"
        id={uniqueId}
        checked={checked}
        onChange={onChange}
        className={checked ? formStyles.checkboxChecked : ""}
      />
      {labelPlacement === "right" ? (
        <label
          style={{ ...labelStyle, cursor: "pointer" }}
          className={labelClassName}
          htmlFor={uniqueId}
        >
          {label}
        </label>
      ) : (
        <></>
      )}
    </div>
  );
};

export const ValidationErrors: FunctionComponent<{
  meta: FieldRenderProps<unknown>["meta"];
}> = ({ meta }) => {
  return meta.error && meta.touched ? (
    <div className={formStyles.error}>
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        color="var(--error)"
        className={formStyles.errorIcon}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-content={meta.error}
        onClick={(event) => {
          event.stopPropagation();
        }}
      />
    </div>
  ) : null;
};

/**
 * This component wraps the CircularSlider component from react-circular-slider
 */
export const DegreesInputSlider: FunctionComponent<{
  value?: number;
  label: string;
  editable: boolean;
  onChange: Function;
  icon: IconDefinition;
  isDragging?: Function;
}> = ({ value, label, editable = true, onChange, icon, isDragging }) => {
  const editableStyle = editable ? "" : formStyles.notEditable;

  return (
    <div className={`${formStyles.degreesInputSlider} ${editableStyle}`}>
      <CircularSlider
        width={100}
        min={0}
        max={360}
        dataIndex={value}
        appendToValue="°"
        label={label}
        labelColor="var(--grey4)"
        labelFontSize="0.8rem"
        valueFontSize="1rem"
        verticalOffset="0.5rem"
        knobPosition="top"
        knobColor={"var(--grey3)"}
        knobSize={20}
        progressColorFrom="var(--grey3)"
        progressColorTo="var(--grey3)"
        progressSize={5}
        trackColor="var(--grey3)"
        trackSize={5}
        trackDraggable={true}
        onChange={onChange}
        isDragging={isDragging}
        initialValue={value}
      >
        <FontAwesomeIcon icon={icon} />
      </CircularSlider>
    </div>
  );
};

/**
 * Color picker
 */
export const PathColorPickerMenu: FunctionComponent<{
  currentColor: string;
  editMode: boolean;
  updateColor: (color: string) => void;
  styleContainer?: CSSProperties;
  direction?: "left" | "right";
  hasDarkBorder?: boolean;
}> = ({
  currentColor,
  editMode,
  updateColor,
  styleContainer,
  direction = "left",
  hasDarkBorder,
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div>
        <div
          style={styleContainer}
          className={`${formStyles.propertyPathColor} ${hasDarkBorder ? formStyles.propertyPathColorDark : formStyles.propertyPathColorLight} ${editMode ? formStyles.propertyEditMode : ""}`}
          onClick={() => {
            if (!editMode) return;
            setShowColorPicker(true);
          }}
        >
          <div
            className={formStyles.pathColorSample}
            style={{
              backgroundColor: currentColor,
            }}
          ></div>
        </div>
        {showColorPicker ? (
          <>
            <div className={formStyles.colorPickerPopover}>
              <div
                className={formStyles.colorPickerCover}
                onClick={() => {
                  setShowColorPicker(false);
                }}
              ></div>
              <div
                className={formStyles.colorPickerMenu}
                ref={menuRef}
                style={direction === "left" ? { transform: "translateX(-180px)" } : null}
              >
                <CompactColor
                  color={currentColor}
                  colors={COLOR_PALATTE}
                  onChange={(color) => {
                    updateColor(color.hex);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
};

/**
 * Should not be called directly. Use the {@link InLineEditInput} component instead
 * @param param0
 * @returns
 */
export const FFInput: FunctionComponent<FFTextProps> = ({
  name,
  ariaLabel,
  label = false,
  validators = [],
  className,
  classNameError,
  style,
  initialValue,
  toFocus,
  onChange,
  onBlur,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    // if set to autoFocus select all text on focus
    if (toFocus) event.target.select();
  };

  useEffect(() => {
    if (toFocus) {
      inputRef.current?.focus();
    }
  }, [toFocus]);

  return (
    <Field
      name={name}
      validate={composeValidators(...validators)}
      initialValue={initialValue}
      type="input"
    >
      {({ input, meta }) => (
        <React.Fragment>
          <div style={{ display: "flex" }}>
            {label ? (
              <label
                data-tooltip-id="aegis-tooltip"
                data-tooltip-content={label.title}
                className={label.className}
                style={label.style}
              >
                {label.label}
              </label>
            ) : null}
            <input
              {...input}
              className={`${className} ${meta.error && meta.touched ? classNameError : null}`}
              type="text"
              aria-label={ariaLabel}
              style={style}
              onChange={(event) => {
                input.onChange(event); //call native on change
                if (onChange) onChange(event); //call custom on change
              }}
              onBlur={(event) => {
                input.onBlur(event);
                if (onBlur) onBlur(event);
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
              onFocus={(event) => {
                input.onFocus(event);
                handleFocus(event);
              }}
              ref={inputRef}
            />
            <ValidationErrors meta={meta} />
          </div>
        </React.Fragment>
      )}
    </Field>
  );
};

/**
 * Should not be called directly. Use the TextArea component instead
 * @param param0
 * @returns
 */
export const FFTextArea: FunctionComponent<FFTextAreaProps> = ({
  name,
  ariaLabel,
  label = false,
  validators = [],
  className,
  classNameError,
  style,
  initialValue,
  onChange,
  onBlur,
}) => {
  return (
    <Field
      name={name}
      validate={composeValidators(...validators)}
      initialValue={initialValue}
      type="text"
    >
      {({ input, meta }) => (
        <React.Fragment>
          {label ? (
            <label
              data-tooltip-id="aegis-tooltip"
              data-tooltip-content={label.title}
              className={label.className}
              style={label.style}
            >
              {label.label}
            </label>
          ) : null}
          <textarea
            {...input}
            className={`${className} ${meta.error && meta.touched ? classNameError : null}`}
            aria-label={ariaLabel}
            style={style}
            onChange={(event) => {
              input.onChange(event); //call native on change
              if (onChange) onChange(event); //call custom on change
            }}
            onBlur={(event) => {
              input.onBlur(event);
              if (onBlur) onBlur(event);
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          />
          <ValidationErrors meta={meta} />
        </React.Fragment>
      )}
    </Field>
  );
};

/**
 * Should not be called directly. Use the {@link Checkbox} component instead
 * @param param0
 * @returns
 */
export const FFCheckbox: FunctionComponent<FFCheckboxProps> = ({
  name,
  label = false,
  className,
  validators = [],
  style = {},
  initialValue,
}) => {
  return (
    <Field
      name={name}
      validate={composeValidators(...validators)}
      type="checkbox"
      initialValue={initialValue}
    >
      {({ input, meta }) => (
        <React.Fragment>
          {label ? (
            <label
              data-tooltip-id="aegis-tooltip"
              data-tooltip-content={label.title}
              className={label.className}
              style={label.style}
            >
              {label.label}
            </label>
          ) : null}
          <div className={className} style={style}>
            <input
              {...input}
              className={meta.error && meta.touched ? "error" : undefined}
              type="checkbox"
              style={style}
            />
          </div>
          <ValidationErrors meta={meta} />
        </React.Fragment>
      )}
    </Field>
  );
};

/**
 * Should not be called directly. Use the {@link Dropdown} component instead
 * @param param0
 * @returns
 */
export const FFSelect: FunctionComponent<FFSelectProps> = ({
  name,
  className,
  label = false,
  searchable = false,
  options,
}) => {
  const selectAdapter = (
    { input, ...rest }: { input: any } // eslint-disable-line @typescript-eslint/no-explicit-any
  ) => <Select {...input} {...rest} className={className} searchable={searchable} />;

  return (
    <Field name={name} component={selectAdapter} type="select" options={options}>
      {label ? (
        <label
          data-tooltip-id="aegis-tooltip"
          data-tooltip-content={label.title}
          className={label.className}
          style={label.style}
        >
          {label.label}
        </label>
      ) : null}
    </Field>
  );
};
