import { FieldValidator } from "final-form";

export type Stringy = string | string[] | number;

/**
 * This file contains validators to be used with form fields
 * Before using these validators in the react-final-form validate property,
 *    they must be passed through the {@link composeValidators} function
 */

const required = (value: Stringy): string | undefined => (value ? undefined : "Required");

const mustBeNumber = (value: Stringy): string | undefined => {
  if (!value) return undefined;
  const regex = /^-?(\d+)(\.\d+)?$/;
  return !regex.test(String(value)) ? "Not a valid number/float" : undefined;
};

const minValue =
  (min: number) =>
  (value: Stringy): string | undefined =>
    isNaN(Number(value)) || Number(value) >= min
      ? undefined
      : `Should be greater than or equal to ${min}`;

const maxValue =
  (max: number) =>
  (value: Stringy): string | undefined =>
    isNaN(Number(value)) || Number(value) <= max
      ? undefined
      : `Should be less than or equal to ${max}`;

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
    return `Must be valid JSON. ${e}`;
  }
  return undefined;
};

const mustBeInteger = (value: Stringy): string | undefined => {
  if (!value) return undefined;
  if (!isNaN(Number(value)) && Number.isInteger(Number(value))) {
    return undefined;
  } else {
    return "Must be an integer";
  }
};

const mustBeNumberGTZero = (value: Stringy): string | undefined => {
  if (!value) return undefined;
  if (!isNaN(Number(value)) && Number(value) > 0) {
    return undefined;
  } else {
    return "Must be an greater than 0";
  }
};

const mustBeNumberGTEZero = (value: Stringy): string | undefined => {
  if (!value) return undefined;
  if (!isNaN(Number(value)) && Number(value) >= 0) {
    return undefined;
  } else {
    return "Must be an greater than or equal to 0";
  }
};

const mustBeHHMMSS = (value: Stringy): string | undefined => {
  if (!value) return undefined;
  if (value === "") return undefined;
  const regex = /^(\-|\+)?([0-9]{2}):([0-9]{2}):([0-9]{2})$/;
  if (regex.test(value as string)) {
    return undefined;
  } else {
    return "Must be in HH:MM:SS format";
  }
};

const mustBeYYYYMMDD = (value: Stringy): string | undefined => {
  if (!value) return undefined;
  if (value === "") return undefined;
  const regex = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
  if (regex.test(value as string)) {
    return undefined;
  } else {
    return "Must be in YYYY-MM-DD format";
  }
};

const mustBeUnique =
  (nameList: string[]) =>
  (value: Stringy): string | undefined => {
    if (!value || !nameList) return undefined;
    const lwrCaseValue = String(value).toLowerCase();
    if (!nameList.some((name) => name && name.toLowerCase() === lwrCaseValue)) {
      return undefined;
    } else {
      return "Name must be unique";
    }
  };

const withinBoundary =
  (minBoundary: number | undefined, maxBoundary: number | undefined) =>
  (value: Stringy): string | undefined => {
    if (!value || !minBoundary || !maxBoundary) return undefined;
    if (minBoundary && maxBoundary) {
      return minBoundary <= Number(value) && Number(value) <= maxBoundary
        ? undefined
        : "Needs to be within boundary";
    }
  };

const mustBeISOString = (value: Stringy): string | undefined => {
  if (!value) return undefined;
  if (typeof value !== "string") return "Must be a string";
  // check using regex for ISO 8601 format
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  if (isoRegex.test(value)) {
    return undefined;
  }
  return "Must be a valid ISO 8601 date string (YYYY-MM-DDTHH:mm:ssZ)";
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
  mustBeNumberGTZero,
  mustBeNumberGTEZero,
  mustBeHHMMSS,
  mustBeYYYYMMDD,
  withinBoundary,
  mustBeUnique,
  mustBeISOString,
};

// UseFieldConfig<any>.validate?: FieldValidator<any>
export const composeValidators = (...validators: FieldValidator<unknown>[]) => {
  return (
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
    value: any,
    allValues: Record<string, unknown>
  ): string | undefined => {
    return validators.reduce((error, validator) => error || validator(value, allValues), undefined);
  };
};

// Regex validators to match characters NOT in the accepted pattern

const regExNumber = /[^\d\.]/;

export const regExValidators = {
  regExNumber,
};
