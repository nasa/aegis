/** A banner's end must follow both its start and the current time. */
export function getBannerTimeError(
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date
): string | null {
  if (startsAt && endsAt && startsAt >= endsAt) {
    return "End time must be after start time.";
  }
  if (endsAt && endsAt <= now) {
    return "End time must be in the future.";
  }
  return null;
}
