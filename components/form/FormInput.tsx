import { FieldValidator } from "final-form";
import React from "react";
import { FunctionComponent } from "react";
import { Field, FieldMetaState } from "react-final-form";
import PropTypes from "prop-types";
import { composeValidators } from "utils/formValidators";
import Select from "react-select";

export const showValidationErrors: FunctionComponent<{
  meta: FieldMetaState<unknown>;
}> = ({ meta }) => {
  return meta.error && meta.touched ? (
    <div style={{ display: "inline-block", fontWeight: "bold", color: "red", textAlign: "right" }}>
      {meta.error}
    </div>
  ) : null;
};
showValidationErrors.propTypes = {
  meta: PropTypes.any,
};

interface label {
  label?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

interface FieldProps {
  name: string;
  label?: label | false;
  validators?: FieldValidator<unknown>[];
  style?: React.CSSProperties;
  className?: string;
  placeholder?: string;
  initialValue?: string;
  disabled?: boolean;
}

export const TextInputField: FunctionComponent<FieldProps> = ({
  name,
  label = false,
  validators = [],
  style = {},
  className,
  placeholder,
  initialValue,
  disabled = false,
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
          {label ? (
            <label title={label.title} className={label.className} style={label.style}>
              {label.label}
            </label>
          ) : null}
          <div className={className}>
            <input
              {...input}
              className={`${meta.error && meta.touched ? "error" : null}`}
              type="text"
              style={style}
              disabled={disabled}
              placeholder={placeholder}
            />
          </div>
          {showValidationErrors({ meta })}
        </React.Fragment>
      )}
    </Field>
  );
};

TextInputField.propTypes = {
  name: PropTypes.string,
  label: PropTypes.any,
  validators: PropTypes.any,
  style: PropTypes.any,
  className: PropTypes.string,
  placeholder: PropTypes.string,
  initialValue: PropTypes.string,
  disabled: PropTypes.bool,
};

export const TextAreaField: FunctionComponent<FieldProps> = ({
  name,
  label = false,
  validators = [],
  style = {},
  className,
  placeholder,
  initialValue,
  disabled = false,
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
            <label title={label.title} className={label.className} style={label.style}>
              {label.label}
            </label>
          ) : null}
          <textarea
            {...input}
            className={`${meta.error && meta.touched ? "error" : null} ${className}`}
            disabled={disabled}
            style={style}
            placeholder={placeholder}
          />
          {showValidationErrors({ meta })}
        </React.Fragment>
      )}
    </Field>
  );
};

TextAreaField.propTypes = {
  name: PropTypes.string,
  label: PropTypes.any,
  validators: PropTypes.any,
  style: PropTypes.any,
  className: PropTypes.string,
  placeholder: PropTypes.string,
  initialValue: PropTypes.string,
  disabled: PropTypes.bool,
};

interface CheckboxInputFieldProps {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  label?: label | false;
  className?: string;
  validators?: FieldValidator<unknown>[];
  style?: React.CSSProperties;
  initialValue?: boolean;
}

export const CheckboxInputField: FunctionComponent<CheckboxInputFieldProps> = ({
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
            <label title={label.title} className={label.className} style={label.style}>
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
          {showValidationErrors({ meta })}
        </React.Fragment>
      )}
    </Field>
  );
};
CheckboxInputField.propTypes = {
  name: PropTypes.string,
  label: PropTypes.any,
  validators: PropTypes.any,
  className: PropTypes.string,
  style: PropTypes.any,
};

interface option {
  value: string;
  label: string;
}

interface SelectInputFieldProps {
  name: string;
  options: option[];
  label?: label | false;
  className?: string;
  searchable?: boolean;
  style?: React.CSSProperties;
}

export const SelectInputField: FunctionComponent<SelectInputFieldProps> = ({
  name,
  className,
  label = false,
  searchable = false,
  style = {},
  options,
}) => {
  const selectAdapter = ({ input, ...rest }) => (
    <Select {...input} {...rest} className={className} style={style} searchable={searchable} />
  );
  return (
    <Field name={name} component={selectAdapter} type="select" options={options}>
      {label ? (
        <label title={label.title} className={label.className} style={label.style}>
          {label.label}
        </label>
      ) : null}
    </Field>
  );
};
SelectInputField.propTypes = {
  name: PropTypes.string,
  className: PropTypes.string,
  label: PropTypes.any,
  style: PropTypes.any,
  options: PropTypes.any,
  searchable: PropTypes.bool,
};
