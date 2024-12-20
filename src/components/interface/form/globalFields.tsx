import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckSquare, faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import {
  FunctionComponent,
  useState,
  CSSProperties,
  ChangeEvent,
  ReactNode,
  useRef,
  useEffect,
} from "react";
import styles from "./globalFields.module.css";
import { TagsInput } from "react-tag-input-component";
import { decodeEmoji } from "utils/formatting";
import { Form } from "react-final-form";
import React from "react";
import { Field, FieldMetaState } from "react-final-form";
import { composeValidators } from "components/interface/form/formValidators";
import Select from "react-select";
import { FFTextProps, FFCheckboxProps, FFSelectProps, FFTextAreaProps } from "typings/form";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import formStyles from "./globalFields.module.css";
import CircularSlider from "@fseehawer/react-circular-slider";
import { CompactPicker } from "react-color";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import debounce from "lodash/debounce";

export const Button: FunctionComponent<{
  onClick: () => void;
  label?: string;
  ariaLabel?: string;
  toolTip?: string;
  icon?: IconDefinition;
  style?: CSSProperties;
  labelStyle?: CSSProperties;
  size?: "xs" | "lg";
  enabled?: boolean;
  iconStyle?: CSSProperties;
}> = ({
  onClick,
  label,
  ariaLabel,
  toolTip,
  icon,
  style,
  labelStyle,
  size,
  enabled = true,
  iconStyle,
}) => {
  const enabledStyle = !enabled ? styles.buttonDisabled : "";
  return (
    <div
      className={`${styles.button} ${enabledStyle} `}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={toolTip}
      onClick={() => {
        if (enabled) onClick();
      }}
      style={style}
      aria-label={ariaLabel || label || ""}
    >
      {icon && (
        <FontAwesomeIcon
          icon={icon}
          size={size}
          className={styles.buttonLabelIcon}
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
  const enabledStyle = !enabled ? styles.iconButtonDisabled : "";
  return (
    <div
      className={`${styles.textboxButton} ${enabledStyle} ${
        active ? (!whiteOnToggle ? styles.textboxActiveGrey : styles.textboxActiveWhite) : ""
      }`}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={toolTip}
      onMouseDown={(e) => {
        onMouseDown(e);
      }}
      style={style}
    >
      {icon && <FontAwesomeIcon icon={icon} size="lg" className={styles.buttonLabelIcon} />}
      <div style={labelStyle}>{label}</div>
    </div>
  );
};

export const Dropdown: FunctionComponent<{
  children: ReactNode;
  selected: string;
  containerStyle?: CSSProperties;
  selectStyle?: CSSProperties;
  arrowStyle?: CSSProperties;
  toolTip?: string;
  onChange: (value: string) => void;
}> = ({ children, selected, containerStyle, selectStyle, arrowStyle, toolTip, onChange }) => {
  return (
    <div
      className={styles.select}
      style={containerStyle}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={toolTip}
    >
      <select
        value={selected}
        style={selectStyle}
        aria-label="dropdown"
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {children}
      </select>
      <div className={styles.select_arrow} style={arrowStyle}>
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
      <div className={styles.iconDropdownContainer}>
        <div className={styles.iconDropdownModalItemNotEditing}>
          <div className={styles.itemIcon}>{decodeEmoji(selected)}</div>
        </div>
      </div>
    );
  } else {
    let selectedItem;
    if (selected) {
      selectedItem = (
        <div
          className={`${styles.iconDropdownModalItemSelected} ${
            expanded && styles.iconDropdownModalItemSelectedExpanded
          }`}
        >
          <div className={styles.itemIcon}>{decodeEmoji(selected)}</div>
        </div>
      );
    } else {
      selectedItem = (
        <div
          className={` ${styles.iconDropdownModalItemSelected} ${
            expanded && styles.iconDropdownModalItemSelectedExpanded
          }`}
        >
          <div className={styles.iconDropdownModalItemLabel}></div>
        </div>
      );
    }

    return (
      <div
        tabIndex={0}
        className={styles.iconDropdownContainer}
        onClick={() => setExpanded(!expanded)}
        onBlur={() => {
          setExpanded(false);
        }}
      >
        {selectedItem}
        <span className={styles.colorSelectArrow}>
          <FontAwesomeIcon icon={faChevronDown} size="xs" />
        </span>
        {expanded && (
          <div className={styles.iconDropdownModalList}>
            {items.map((item, index) => {
              return (
                <div
                  className={styles.iconDropdownModalItem}
                  key={`${item}_${index}`}
                  onClick={() => setSelected(item)}
                >
                  <div className={styles.itemIcon}>{decodeEmoji(item)}</div>
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
        className={`${styles.multiselectDropdownContainer} ${containerClassName}`}
        style={containerStyle}
        onBlur={() => {
          if (closeOnBlur) setMenuOpen(false);
        }}
      >
        <div
          className={`${styles.multiselectDropdownHeader} ${headerClassName}`}
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
          <div className={styles.multiselectDropdownItems}>
            {items.map((item) => (
              <div
                key={item.value}
                className={styles.multiselectDropdownItem}
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

                <div className={styles.multiselectDropdownItemTitle}>{item.label}</div>
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
 * New validators can be added and exported from /utils/formValidators
 */
export const InLineEditInput: FunctionComponent<{
  value: string;
  editing: boolean;
  fieldProps: FFTextProps;
  styleValue?: CSSProperties;
  styleContainer?: CSSProperties;
  onSubmit?: (value: string) => void;
  toFocus?: boolean;
}> = ({ value, editing, styleValue, styleContainer, onSubmit, fieldProps, toFocus }) => {
  const debouncedSubmitRef = useRef(
    debounce((formValue) => {
      if (onSubmit) onSubmit(formValue);
    }, 50)
  );

  return (
    <div style={styleContainer}>
      {debouncedSubmitRef.current && editing && (
        <Form
          //only called if all validation passes
          onSubmit={(formValues) => {
            debouncedSubmitRef.current(formValues[fieldProps.name]);
          }}
          initialValues={{ [fieldProps.name]: value }}
          render={({ handleSubmit, form }) => {
            return (
              <form onSubmit={handleSubmit}>
                <FFInput
                  {...fieldProps}
                  className={styles.inLineEditInput}
                  classNameError={styles.inLineEditInputError}
                  onChange={() => {
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
          className={styles.inLineEditValue}
          style={styleValue}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={fieldProps.ariaLabel}
          aria-label={fieldProps.ariaLabel}
        >
          {value}
        </div>
      )}
    </div>
  );
};

export const Tags: FunctionComponent<{
  value: string[];
  editing: boolean;
  onChange: (tags: string[]) => void;
  name: string;
  separators: string[];
  placeHolder: string;
  onExisting: (tag: string) => void;
}> = ({ value, editing, onChange, name, separators, placeHolder, onExisting }) => {
  return (
    <>
      {editing && (
        <div className={styles.tagsContainer}>
          <TagsInput
            value={value}
            onChange={onChange}
            name={name}
            separators={separators}
            placeHolder={placeHolder}
            onExisting={onExisting}
          />
        </div>
      )}
      {!editing && (
        <div className={styles.tagListContainer}>
          {value.map((tag) => (
            <div className={styles.tagListItem} key={tag}>
              {tag}
            </div>
          ))}
        </div>
      )}
    </>
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
  const editableStyle = editable ? "null" : styles.notEditable;

  return (
    <div
      className={`${styles.checkboxContainer} ${editableStyle}`}
      onClick={onClick}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={toolTip}
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
        className={checked ? styles.checkboxChecked : ""}
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
  meta: FieldMetaState<unknown>;
}> = ({ meta }) => {
  return meta.error && meta.touched ? (
    <div className={formStyles.error}>
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        color="var(--error)"
        className={formStyles.errorIcon}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html={meta.error}
        onClick={(event) => {
          event.stopPropagation();
        }}
      />
    </div>
  ) : null;
};

/**
 * This component wraps the CicrularSlider component from react-circular-slider
 */
export const DegreesInputSlider: FunctionComponent<{
  value?: number;
  label: string;
  editable: boolean;
  onChange: Function;
  icon: IconDefinition;
  isDragging?: Function;
}> = ({ value, label, editable = true, onChange, icon, isDragging }) => {
  const editableStyle = editable ? "" : styles.notEditable;

  return (
    <div className={`${styles.degreesInputSlider} ${editableStyle}`}>
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMenuOpen = (e: React.MouseEvent) => {
    const directionPadding = direction === "left" ? -250 : 0;
    const x = e.clientX + directionPadding;
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${e.clientY}px`;

    dialogRef.current?.showModal();
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        className={styles.dialogContainer}
        onClick={() => {
          dialogRef.current?.close();
        }}
      >
        <div className={styles.pickerMenu} ref={menuRef}>
          <CompactPicker
            color={currentColor}
            onChange={(color) => {
              updateColor(color.hex);
            }}
          />
        </div>
      </dialog>

      <div
        style={styleContainer}
        className={`${styles.propertyPathColor} ${hasDarkBorder ? styles.propertyPathColorDark : styles.propertyPathColorLight} ${editMode ? styles.propertyEditMode : ""}`}
        onClick={(e) => {
          if (!editMode) return;
          handleMenuOpen(e);
          dialogRef.current?.showModal();
          e.stopPropagation();
        }}
      >
        <div
          className={styles.pathColorSample}
          style={{
            backgroundColor: currentColor,
          }}
        ></div>
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
                data-tooltip-html={label.title}
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
 * Should not be called directly. Use the WysiwygTextArea component instead
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
              data-tooltip-html={label.title}
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
              data-tooltip-html={label.title}
              className={label.className}
              style={label.style}
            >
              {label.label}
            </label>
          ) : null}
          <div className={className} style={style}>
            <input
              {...input}
              className={meta.error && meta.touched ? "error" : null}
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
          data-tooltip-html={label.title}
          className={label.className}
          style={label.style}
        >
          {label.label}
        </label>
      ) : null}
    </Field>
  );
};
