import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent, useState, CSSProperties, ChangeEvent, ReactNode } from "react";
import styles from "./globalFields.module.css";
import { TagsInput } from "react-tag-input-component";
import { decodeEmoji } from "utils/formatting";
import { Form } from "react-final-form";
import React from "react";
import { Field, FieldMetaState } from "react-final-form";
import { composeValidators } from "components/interface/form/formValidators";
import Select from "react-select";
import { FFTextProps, FFCheckboxProps, FFSelectProps } from "typings/form";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import formStyles from "./globalFields.module.css";
import CircularSlider from "@fseehawer/react-circular-slider";

export const Button: FunctionComponent<{
  onClick: () => void;
  label?: string;
  toolTip?: string;
  icon?: IconDefinition;
  style?: CSSProperties;
  labelStyle?: CSSProperties;
  size?: "xs" | "lg";
  enabled?: boolean;
}> = ({ onClick, label, toolTip, icon, style, labelStyle, size, enabled = true }) => {
  const enabledStyle = !enabled ? styles.iconButtonDisabled : "";
  return (
    <div
      className={`${styles.button} ${enabledStyle} `}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={toolTip}
      onClick={onClick}
      style={style}
    >
      {icon && <FontAwesomeIcon icon={icon} size={size} className={styles.buttonLabelIcon} />}
      <div style={labelStyle}>{label}</div>
    </div>
  );
};

export const TextboxButton: FunctionComponent<{
  onMouseDown: (event: MouseEvent) => void;
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

/**
 * This component wraps the {@link FFInput} component inside a react-final-form {@link Form}
 *    to allow each input to validate and submit individually (no singular save button for the entire page)
 * The onSubmit function is called onBlur. This is where the redux store update action should be defined
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
}> = ({ value, editing, styleValue, styleContainer, onSubmit, fieldProps }) => {
  return (
    <div style={styleContainer}>
      {editing && (
        <Form
          onSubmit={(formValues) => {
            if (onSubmit) onSubmit(formValues[fieldProps.name]);
          }}
          initialValues={{ [fieldProps.name]: value }}
          render={({ handleSubmit, form }) => {
            return (
              <form onSubmit={handleSubmit}>
                <FFInput
                  {...fieldProps}
                  className={styles.inLineEditInput}
                  classNameError={styles.inLineEditInputError}
                  onBlur={(event: React.FocusEvent) => {
                    if (fieldProps.onBlur) fieldProps.onBlur(event);
                    form.submit(); //also submit the form so it saves data
                  }}
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
  editable?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  toolTip?: string;
}> = ({ checked, editable = true, onChange, toolTip }) => {
  const editableStyle = editable ? "null" : styles.notEditable;

  return (
    <div
      className={`${styles.checkboxContainer} ${editableStyle}`}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={toolTip}
    >
      <input
        type="checkbox"
        aria-label="checkbox"
        checked={checked}
        onChange={onChange}
        className={checked ? styles.checkboxChecked : ""}
      />
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
  value: number;
  label: string;
  editable: boolean;
  onChange: Function;
  icon: IconDefinition;
}> = ({ value, label, editable = true, onChange, icon }) => {
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
      >
        <FontAwesomeIcon icon={icon} />
      </CircularSlider>
    </div>
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
  onChange,
  onBlur,
}) => {
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
                if (onChange) onChange(event); //call custom on change
                input.onChange(event); //call native on change
              }}
              onBlur={(event) => {
                if (onBlur) onBlur(event);
                input.onBlur(event);
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
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
export const FFTextArea: FunctionComponent<FFTextProps> = ({
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
              if (onChange) onChange(event); //call custom on change
              input.onChange(event); //call native on change
            }}
            onBlur={(event) => {
              if (onBlur) onBlur(event);
              input.onBlur(event);
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
