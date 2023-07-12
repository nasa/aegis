import _ from "lodash";
import { add } from "store/playhead";

/**
 * Return a zero padded string of a number
 */
export function padZeros(num: number, size: number): string {
  const s = num.toString();
  return s.padStart(size, "0");
}

/**
 * Calculates seconds into day (appSeconds) of any isoString timestamp
 */
export function appSecondsFromDateString(dateStringParam: string): number {
  const isoString = isoStringFromAnyDateString(dateStringParam);
  const startOfDay = new Date(`${isoString.split("T")[0]}T00:00:00Z`);
  const isoDate = new Date(isoString);
  return (isoDate.getTime() - startOfDay.getTime()) / 1000;
}

/**
 * Formats any isoString timestamp into hh:mm:ss
 */
export function hhmmssFromDateString(dateStringParam: string): string {
  if (dateStringParam === "") {
    return "";
  }
  const isoString = isoStringFromAnyDateString(dateStringParam);
  const tempDate = new Date(isoString);
  const hh = padZeros(tempDate.getUTCHours(), 2);
  const mm = padZeros(tempDate.getUTCMinutes(), 2);
  const ss = padZeros(tempDate.getUTCSeconds(), 2);
  return `${hh}:${mm}:${ss}`;
}

/**
 * Formats any appSeconds value into hh:mm:ss equivalent
 */
export function hhmmssFromSeconds(secondsParam: number): string {
  const hours = Math.abs(Math.trunc(secondsParam / 3600));
  const minutes = (Math.abs(Math.trunc(secondsParam / 60)) % 60) % 60;
  let seconds = Math.abs(Math.trunc(secondsParam)) % 60;
  seconds = Math.floor(seconds);
  let timeStr = padZeros(hours, 2) + ":" + padZeros(minutes, 2) + ":" + padZeros(seconds, 2);
  if (secondsParam < 0) {
    timeStr = "-" + timeStr;
  }
  return timeStr;
}

/**
 * Formats any appSeconds value into hh:mm:ss.mmm equivalent
 */
export function hhmmssmmmFromSeconds(secondsParam: number): string {
  const hours = Math.abs(Math.trunc(secondsParam / 3600));
  const minutes = (Math.abs(Math.trunc(secondsParam / 60)) % 60) % 60;
  const seconds = Math.abs(Math.trunc(secondsParam)) % 60;
  const milliseconds = (secondsParam - Math.trunc(secondsParam)).toFixed(3);
  let timeStr =
    padZeros(hours, 2) +
    ":" +
    padZeros(minutes, 2) +
    ":" +
    padZeros(seconds, 2) +
    "." +
    milliseconds.toString().substring(2);
  if (secondsParam < 0) {
    timeStr = "-" + timeStr;
  }
  return timeStr;
}

/**
 * Formats any minutes into hh:mm equivalent
 */
export function hhmmFromMinutes(minutesParam: number): string {
  const hours = Math.abs(Math.trunc(minutesParam / 60));
  const minutes = Math.abs(Math.round(minutesParam)) % 60;
  let timeStr = padZeros(hours, 2) + ":" + padZeros(minutes, 2);
  if (minutesParam < 0) {
    timeStr = "-" + timeStr;
  }
  return timeStr;
}

/**
 * Formats any isoString timestamp into yyyy-mm-dd
 */
export function shortdateFromDateString(dateString: string): string {
  if (dateString === "") return "";

  dateString = isoStringFromAnyDateString(dateString);
  const tempDate = new Date(dateString);
  return (
    tempDate.getUTCFullYear() +
    "-" +
    padZeros(tempDate.getUTCMonth() + 1, 2) +
    "-" +
    padZeros(tempDate.getUTCDate(), 2)
  );
}

/**
 * Formats any isoString timestamp into yyyy-mm-dd hh:mm:ss
 */
export function longdateFromDateString(dateString: string): string {
  if (dateString === "") return "";

  dateString = isoStringFromAnyDateString(dateString);
  const tempDate = new Date(dateString);
  return (
    tempDate.getUTCFullYear() +
    "-" +
    padZeros(tempDate.getUTCMonth() + 1, 2) +
    "-" +
    padZeros(tempDate.getUTCDate(), 2) +
    " " +
    padZeros(tempDate.getUTCHours(), 2) +
    ":" +
    padZeros(tempDate.getUTCMinutes(), 2) +
    ":" +
    padZeros(tempDate.getUTCSeconds(), 2)
  );
}

/**
 * Takes a date string and returns an isoString, throwing an error if conversion is impossible
 */
export function isoStringFromAnyDateString(dateString: string): string {
  const tempDate = new Date(dateString); // works with ISO and UTC date strings
  if (_.isNaN(tempDate.valueOf())) {
    throw new Error("The date string couldn't be converted into a Date");
  }
  return tempDate.toISOString(); // guaranteed to have an ISO string. safe to string parse it
}

export function getPlayheadISOString(playheadDate: string, playheadSeconds: number): string {
  const date = new Date(playheadDate);
  const withSeconds = add(date, playheadSeconds * 1000);
  return withSeconds.toISOString();
}

/** Get a formatted pseudo-julian date */
export function getJulianDate(date: Date): string {
  const year = date.getUTCFullYear();

  // borrowed from https://stackoverflow.com/a/8619946
  const start = new Date(Date.UTC(year, 0, 0));
  const msDiff = date.valueOf() - start.valueOf();
  const msOneDay = 1000 * 60 * 60 * 24;
  const jd = Math.floor(msDiff / msOneDay);

  return `${year}/${jd}`;
}

/**
 * Round Date to nearest second
 */
export function roundDateToSecond(date: Date): Date {
  return new Date(Math.round(date.getTime() / 1000) * 1000);
}

/**
 * Convert any string to a valid decimal number by stripping out all non-numeric characters
 */
export function toDecimal(str: string): number {
  if (_.isEmpty(str)) return null;
  const removedChars = str.replace(/[^0-9.-]/g, "");
  // make sure string contains only one decimal point
  const decimalCount = (removedChars.match(/\./g) || []).length;
  let result;
  if (decimalCount > 1) {
    //split string at first decimal point
    const splitString = removedChars.split(".");
    //join string back together, but only include the first decimal point
    let joinedString = splitString[0] + ".";
    //add the rest of the string back on
    for (let i = 1; i < splitString.length; i++) {
      joinedString += splitString[i];
    }
    result = parseFloat(joinedString);
  } else {
    result = parseFloat(removedChars);
  }

  return _.isNaN(result) ? null : result;
}

/**
 * Convert an emoji "unified" string to a multi-byte emoji character
 */
export const decodeEmoji = (str: string): string => {
  if (!str) return "";
  let emoji;
  try {
    emoji = str
      .split("-")
      .map((codePoint) => String.fromCodePoint(parseInt(codePoint, 16)))
      .join("");
  } catch (e) {
    return "";
  }
  return emoji;
};

/**
 * Format a number to a string with commas and 2 decimal places
 */
export function formatNumberWithCommas(num: number): string {
  if (_.isNil(num)) return "";
  return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const getPercentOrDefault = (value: number | undefined): number => {
  return typeof value === "number" ? Math.round(value * 100) : 100;
};
