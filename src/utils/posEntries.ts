import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash/isEqual";

import { isPlacedLocation } from "utils/assets";

/** Dark golden yellow used wherever a position has no custom color. */
export const DEFAULT_POS_ENTRY_COLOR = "#C49A00";

export function getPosEntryColor(entry: Pick<PosEntry, "color">): string {
  return entry.color ?? DEFAULT_POS_ENTRY_COLOR;
}

export const POS_ENTRY_RADIUS_MAX_METERS = 1_000;
export const POS_ENTRY_NOTES_MAX_LENGTH = 10_000;

export function validatePosEntryRadius(radius: number): string | null {
  return !Number.isFinite(radius) || radius < 0 || radius > POS_ENTRY_RADIUS_MAX_METERS
    ? `Radius must be between 0 and ${POS_ENTRY_RADIUS_MAX_METERS} meters`
    : null;
}

/** Color of a position's radius circle, or null when the radius is zero and no circle is drawn. */
export function getPosEntryRadiusColor(
  entry: Pick<PosEntry, "color" | "uncertaintyMeters">
): string | null {
  return entry.uncertaintyMeters > 0 ? getPosEntryColor(entry) : null;
}

/**
 * Newest-first order: PET descending, then creation time descending, then uuid, so entries
 * with equal PET keep a stable order.
 */
export function comparePosEntriesNewestFirst(
  a: Pick<PosEntry, "petSeconds" | "createdAt" | "uuid">,
  b: Pick<PosEntry, "petSeconds" | "createdAt" | "uuid">
): number {
  return (
    (b.petSeconds ?? 0) - (a.petSeconds ?? 0) ||
    (b.createdAt ?? 0) - (a.createdAt ?? 0) ||
    (a.uuid < b.uuid ? 1 : a.uuid > b.uuid ? -1 : 0)
  );
}

export function orderPosEntriesNewestFirst<T extends PosEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(comparePosEntriesNewestFirst);
}

/** Up to `limit` newest entries per pos type uuid, newest first. */
export function getLatestPosEntriesByType<T extends PosEntry>(
  entries: readonly T[],
  limit = 2
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const entry of orderPosEntriesNewestFirst(entries)) {
    for (const posTypeUuid of entry.posTypeUuids) {
      if (!result[posTypeUuid]) result[posTypeUuid] = [];
      if (result[posTypeUuid].length < limit) result[posTypeUuid].push(entry);
    }
  }
  return result;
}

/** Uuids of the entries that are the newest for at least one pos type. */
export function getLatestPosEntryUuids(entries: readonly PosEntry[]): Set<string> {
  const latest = new Set<string>();
  for (const typeEntries of Object.values(getLatestPosEntriesByType(entries, 1))) {
    latest.add(typeEntries[0].uuid);
  }
  return latest;
}

/** The most recently created entry, used to prefill a new one. */
export function getMostRecentPosEntry(entries: readonly PosEntry[]): PosEntry | null {
  let latest: PosEntry | null = null;
  for (const entry of entries) {
    if (
      !latest ||
      entry.createdAt > latest.createdAt ||
      (entry.createdAt === latest.createdAt && entry.uuid > latest.uuid)
    ) {
      latest = entry;
    }
  }
  return latest;
}

export const POS_ENTRY_EDIT_FIELDS: readonly (keyof PosEntryEditValues)[] = [
  "location",
  "elevation",
  "petSeconds",
  "posTypeUuids",
  "posSourceUuid",
  "uncertaintyMeters",
  "color",
  "notes",
];

/** Detached copy of the editable fields of a position entry. */
export function getPosEntryEditValues(entry: PosEntry): PosEntryEditValues {
  return {
    location: entry.location ? { lat: entry.location.lat, lng: entry.location.lng } : null,
    elevation: entry.elevation ?? null,
    petSeconds: entry.petSeconds ?? null,
    posTypeUuids: [...(entry.posTypeUuids ?? [])],
    posSourceUuid: entry.posSourceUuid ?? null,
    uncertaintyMeters: entry.uncertaintyMeters ?? 0,
    color: entry.color ?? null,
    notes: entry.notes ?? null,
  };
}

const LOCATION_FIELDS: readonly (keyof PosEntryEditValues)[] = ["location", "elevation"];

/**
 * Fields of `values` that differ from `base`, detached. Location and elevation are one unit:
 * a change to either carries both.
 */
export function getChangedPosEntryFields(
  base: PosEntryEditValues,
  values: PosEntryEditValues
): Partial<PosEntryEditValues> {
  const changes: Partial<PosEntryEditValues> = {};
  for (const field of POS_ENTRY_EDIT_FIELDS) {
    if (!isEqual(base[field] ?? null, values[field] ?? null)) {
      (changes as Record<string, unknown>)[field] = cloneDeep(values[field] ?? null);
    }
  }
  if (LOCATION_FIELDS.some((field) => field in changes)) {
    for (const field of LOCATION_FIELDS) {
      (changes as Record<string, unknown>)[field] = cloneDeep(values[field] ?? null);
    }
  }
  return changes;
}

/** Validation message for in-edit values, or null when they can be saved. */
export function validatePosEntryEditValues(
  values: PosEntryEditValues,
  rex: Pick<Rex, "posTypes" | "posSources">
): string | null {
  if (!values.posTypeUuids.some((uuid) => rex.posTypes?.some((type) => type.uuid === uuid))) {
    return "Select at least one position type";
  }
  if (!rex.posSources?.some((source) => source.uuid === values.posSourceUuid)) {
    return "Select a source";
  }
  const radiusError = validatePosEntryRadius(values.uncertaintyMeters);
  if (radiusError) return radiusError;
  if ((values.notes?.length ?? 0) > POS_ENTRY_NOTES_MAX_LENGTH)
    return `Notes must be ${POS_ENTRY_NOTES_MAX_LENGTH} characters or fewer`;
  if (values.petSeconds === null) return "PET is required";
  if (!Number.isSafeInteger(values.petSeconds)) return "PET must be a whole number of seconds";
  if (!isPlacedLocation(values.location))
    return "Place the position on the map or enter coordinates";
  return null;
}

/**
 * The REX's entries as drawn on the map, with the open edit session replacing its saved entry
 * under the same uuid (or appended, for a new entry). Draft gaps fall back to the saved values.
 */
export function applyPosEntryDraft(
  entries: readonly PosEntry[],
  inEdit: PosEntryInEdit | null,
  rexUuid: string | null
): PosEntry[] {
  if (!inEdit || inEdit.rexUuid !== rexUuid) return [...entries];
  const saved = entries.find((entry) => entry.uuid === inEdit.uuid);
  if (!saved && !inEdit.isNew) return [...entries];
  const values = inEdit.values;
  const draft: PosEntry = {
    uuid: inEdit.uuid,
    createdAt: saved?.createdAt ?? Number.MAX_SAFE_INTEGER,
    updatedAt: saved?.updatedAt ?? Number.MAX_SAFE_INTEGER,
    location: values.location,
    elevation: values.elevation,
    petSeconds: values.petSeconds ?? saved?.petSeconds ?? 0,
    posTypeUuids: values.posTypeUuids,
    posSourceUuid: values.posSourceUuid ?? saved?.posSourceUuid ?? "",
    uncertaintyMeters: values.uncertaintyMeters,
    color: values.color,
    notes: values.notes ?? null,
  };
  return saved
    ? entries.map((entry) => (entry.uuid === inEdit.uuid ? draft : entry))
    : [...entries, draft];
}
