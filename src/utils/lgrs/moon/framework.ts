import { conformLongitude, getEnvelopeLongitudes } from "../common";
import {
  LTM_LATITUDE_BAND_LETTERS,
  LTM_MAX_ABS_LATITUDE,
  LTM_ZONE_COUNT,
  LTM_ZONE_WIDTH_DEGREES,
} from "./constants";
import { getLtmCrsId, LGRS_CRS_LPS_NORTH, LGRS_CRS_LPS_SOUTH } from "./crs";

// Moon regions in a view, the zone/band framework and the zone-tier labels.

const BAND_DEGREES = 8;
const POLAR_LABEL_LATITUDE = 85;

/** LTM zones overlapping the envelope's longitudes. */
function getEnvelopeZones(envelope: LgrsViewEnvelope): number[] {
  if (envelope.fullLon) return Array.from({ length: LTM_ZONE_COUNT }, (_, index) => index + 1);
  const first = Math.floor((envelope.minLon + 180) / LTM_ZONE_WIDTH_DEGREES);
  const last = Math.floor((envelope.maxLon + 180) / LTM_ZONE_WIDTH_DEGREES - 1e-12);
  const zones: number[] = [];
  for (let k = first; k <= Math.min(last, first + LTM_ZONE_COUNT - 1); k++) {
    zones.push((((k % LTM_ZONE_COUNT) + LTM_ZONE_COUNT) % LTM_ZONE_COUNT) + 1);
  }
  return zones;
}

/** LPS caps and LTM zone/hemisphere cells overlapping the envelope. */
export function getMoonCandidateRegions(envelope: LgrsViewEnvelope): LgrsCrsId[] {
  const regions: LgrsCrsId[] = [];
  const { minLat, maxLat } = envelope;
  if (minLat <= -LTM_MAX_ABS_LATITUDE) regions.push(LGRS_CRS_LPS_SOUTH);
  if (maxLat >= LTM_MAX_ABS_LATITUDE) regions.push(LGRS_CRS_LPS_NORTH);
  const north = maxLat >= 0 && minLat < LTM_MAX_ABS_LATITUDE;
  const south = minLat < 0 && maxLat > -LTM_MAX_ABS_LATITUDE;
  for (const zone of getEnvelopeZones(envelope)) {
    if (north) regions.push(getLtmCrsId(zone, "N"));
    if (south) regions.push(getLtmCrsId(zone, "S"));
  }
  return regions;
}

/**
 * Seams: zone meridians, ±80° and the equator. The zone tier adds the 8° band parallels and the
 * LPS A/B (Y/Z) split meridians.
 */
export function getMoonFrameworkLines(
  envelope: LgrsViewEnvelope,
  zoneTier: boolean
): LgrsFrameworkLine[] {
  const { minLat, maxLat, minLon, maxLon } = envelope;
  const lines: LgrsFrameworkLine[] = [];
  const ltmMinLat = Math.max(minLat, -LTM_MAX_ABS_LATITUDE);
  const ltmMaxLat = Math.min(maxLat, LTM_MAX_ABS_LATITUDE);
  for (const lon of getEnvelopeLongitudes(envelope, BAND_DEGREES, -180)) {
    lines.push({ kind: "seam", axis: "meridian", value: lon, from: ltmMinLat, to: ltmMaxLat });
  }
  for (const lat of [-LTM_MAX_ABS_LATITUDE, 0, LTM_MAX_ABS_LATITUDE]) {
    lines.push({ kind: "seam", axis: "parallel", value: lat, from: minLon, to: maxLon });
  }
  if (!zoneTier) return lines;
  for (let lat = -LTM_MAX_ABS_LATITUDE + BAND_DEGREES; lat < LTM_MAX_ABS_LATITUDE; lat += 8) {
    if (lat !== 0) {
      lines.push({ kind: "grid", axis: "parallel", value: lat, from: minLon, to: maxLon });
    }
  }
  for (const lon of getEnvelopeLongitudes(envelope, 180, 0)) {
    lines.push({
      kind: "grid",
      axis: "meridian",
      value: lon,
      from: Math.max(minLat, -90),
      to: Math.min(maxLat, -LTM_MAX_ABS_LATITUDE),
    });
    lines.push({
      kind: "grid",
      axis: "meridian",
      value: lon,
      from: Math.max(minLat, LTM_MAX_ABS_LATITUDE),
      to: Math.min(maxLat, 90),
    });
  }
  return lines;
}

/** LPS band letters, then a `<zone><band>` label at every zone/band cell centre. */
export function getMoonZoneLabels(envelope: LgrsViewEnvelope): LgrsZoneLabel[] {
  const labels: LgrsZoneLabel[] = [
    { lat: -POLAR_LABEL_LATITUDE, lon: -90, crs: LGRS_CRS_LPS_SOUTH, text: "A" },
    { lat: -POLAR_LABEL_LATITUDE, lon: 90, crs: LGRS_CRS_LPS_SOUTH, text: "B" },
    { lat: POLAR_LABEL_LATITUDE, lon: -90, crs: LGRS_CRS_LPS_NORTH, text: "Y" },
    { lat: POLAR_LABEL_LATITUDE, lon: 90, crs: LGRS_CRS_LPS_NORTH, text: "Z" },
  ];
  for (const lon of getEnvelopeLongitudes(envelope, BAND_DEGREES, -176)) {
    const zone = Math.round((conformLongitude(lon) + 176) / BAND_DEGREES) + 1;
    for (let lat = -LTM_MAX_ABS_LATITUDE + 4; lat < LTM_MAX_ABS_LATITUDE; lat += BAND_DEGREES) {
      const band = LTM_LATITUDE_BAND_LETTERS[Math.floor(lat / BAND_DEGREES) + 11];
      labels.push({
        lat,
        lon,
        crs: getLtmCrsId(zone, lat < 0 ? "S" : "N"),
        text: `${zone}${band}`,
      });
    }
  }
  return labels;
}
