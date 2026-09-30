/**
 * Label Layout — overlap-based opacity for marker labels.
 *
 * Labels stay at a fixed pixel offset from their markers (no auto-spreading).
 * Overlapping is allowed — lower-priority labels dim when occluded by
 * higher-priority ones. Dragging a label out from under another restores
 * full opacity.
 *
 * Priority: lander (0) > station (1) > POI (2) > action (3).
 * Higher-priority labels are always fully opaque and rendered on top.
 */

export interface LabelDescriptor {
  /** Unique ID matching the parent marker feature */
  id: string;
  /** Pixel position of the label centre on screen */
  labelPx: [number, number];
  /** Label text width in pixels */
  textWidth: number;
  /** Label text height in pixels */
  textHeight: number;
  /**
   * Priority tier: lower = higher priority.
   * 0 = lander, 1 = station, 2 = POI, 3 = action
   */
  priority: number;
}

export interface LabelOpacity {
  id: string;
  /** 0.0–1.0 — how opaque this label should render */
  opacity: number;
}

/** Default pixel offset from marker anchor to label centre [dx, dy] (positive Y = above in map coords) */
export const DEFAULT_LABEL_OFFSET: [number, number] = [0, 28];

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function makeRect(cx: number, cy: number, w: number, h: number): Rect {
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Grid resolution for union-coverage sampling. 16x8 = 128 samples per label
// gives stable opacity to ~1% with negligible cost vs full inclusion-exclusion.
const COVERAGE_GRID_W = 16;
const COVERAGE_GRID_H = 8;

/**
 * Fraction of `target` covered by the union of `others`. Uses point sampling
 * on a fixed grid so 3+ overlapping `others` don't double-count the same area.
 */
function unionCoverageFraction(target: Rect, others: Rect[]): number {
  if (others.length === 0 || target.w <= 0 || target.h <= 0) return 0;
  const cellW = target.w / COVERAGE_GRID_W;
  const cellH = target.h / COVERAGE_GRID_H;
  let covered = 0;
  for (let i = 0; i < COVERAGE_GRID_W; i++) {
    const x = target.x + (i + 0.5) * cellW;
    for (let j = 0; j < COVERAGE_GRID_H; j++) {
      const y = target.y + (j + 0.5) * cellH;
      for (const r of others) {
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
          covered++;
          break;
        }
      }
    }
  }
  return covered / (COVERAGE_GRID_W * COVERAGE_GRID_H);
}

// ---------------------------------------------------------------------------
// Opacity computation
// ---------------------------------------------------------------------------

/** Minimum opacity for a fully-overlapped label */
const MIN_OPACITY = 0.2;

/**
 * Compute opacities for all labels based on overlap with higher-priority labels.
 *
 * Labels are processed in priority order. Each label checks how much of its
 * area is overlapped by already-processed (higher-priority) labels. Opacity
 * is reduced proportionally to the overlap fraction.
 */
export function computeLabelOpacities(labels: LabelDescriptor[]): LabelOpacity[] {
  const sorted = [...labels].sort((a, b) => a.priority - b.priority);

  const placed: { rect: Rect; priority: number }[] = [];
  const results: LabelOpacity[] = [];

  for (const label of sorted) {
    const rect = makeRect(label.labelPx[0], label.labelPx[1], label.textWidth, label.textHeight);

    // Coverage by the *union* of higher-priority labels (not the sum of their
    // overlaps — that would double-count where two higher-priority labels overlap).
    const overlapping: Rect[] = [];
    for (const p of placed) {
      if (rectsOverlap(rect, p.rect)) overlapping.push(p.rect);
    }
    const coverageFraction = unionCoverageFraction(rect, overlapping);
    const opacity = Math.max(MIN_OPACITY, 1.0 - coverageFraction * (1.0 - MIN_OPACITY));

    placed.push({ rect, priority: label.priority });
    results.push({ id: label.id, opacity });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Text measurement helper
// ---------------------------------------------------------------------------

let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!_measureCtx) {
    const canvas = document.createElement("canvas");
    _measureCtx = canvas.getContext("2d");
    if (_measureCtx) _measureCtx.font = "12px sans-serif";
  }
  return _measureCtx;
}

/**
 * Measure the pixel dimensions of a label text string.
 */
export function measureLabelText(
  name: string,
  fontSizePx = 14
): { width: number; height: number } | null {
  const ctx = getMeasureCtx();
  if (!ctx) return null;
  ctx.font = `${fontSizePx}px sans-serif`;
  const metrics = ctx.measureText(name);
  return { width: metrics.width + 12, height: fontSizePx + 8 }; // padding included
}
