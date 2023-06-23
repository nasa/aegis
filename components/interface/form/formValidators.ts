import { FieldValidator } from "final-form";

export type Stringy = string | string[] | number;

/**
 * This file contains validators to be used with form fields
 * Before using these validators in the react-final-form validate property,
 *    they must be passed through the {@link composeValidators} function
 */

const required = (value: Stringy): string | undefined => (value ? undefined : "Required");

const mustBeNumber = (value: Stringy): string | undefined =>
  value && isNaN(Number(value)) ? "Must be a number" : undefined;

const minValue =
  (min: number) =>
  (value: Stringy): string | undefined =>
    isNaN(Number(value)) || Number(value) >= min ? undefined : `Should be greater than ${min}`;

const maxValue =
  (max: number) =>
  (value: Stringy): string | undefined =>
    isNaN(Number(value)) || Number(value) <= max ? undefined : `Should be less than ${max}`;

const minLength =
  (min: number) =>
  (value: Stringy): string | undefined => {
    if (!value) return undefined;
    return typeof value === "string" && value.length >= min
      ? undefined
      : `Must be at least ${min} characters`;
  };

const maxLength =
  (max: number) =>
  (value: Stringy): string | undefined => {
    if (!value) return undefined;
    return typeof value === "string" && value.length <= max
      ? undefined
      : `Must be at no more than ${max} characters`;
  };

const mustBeValidJSON = (value: Stringy): string | undefined => {
  if (!value) return undefined;
  try {
    JSON.parse(value as string);
  } catch (e) {
    return "Must be valid JSON";
  }
  return undefined;
};

const mustBeInteger = (value: Stringy): string | undefined => {
  if (!value) return undefined;
  return isNaN(Number(value)) || Number(value) - Math.floor(Number(value)) === 0
    ? undefined
    : "Must be an integer";
};

export const validators = {
  required,
  mustBeNumber,
  minValue,
  maxValue,
  minLength,
  maxLength,
  mustBeValidJSON,
  mustBeInteger,
};

// UseFieldConfig<any>.validate?: FieldValidator<any>
export const composeValidators = (...validators: FieldValidator<unknown>[]) => {
  return (
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    value: any,
    allValues: Record<string, unknown>
  ): string | undefined => {
    return validators.reduce((error, validator) => error || validator(value, allValues), undefined);
  };
};

// Regex validators to match characters NOT in the accepeted pattern

const regExNumber = /[^\d\.]/;

export const regExValidators = {
  regExNumber,
};
