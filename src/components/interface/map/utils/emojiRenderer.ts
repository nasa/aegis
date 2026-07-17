/**
 * Emoji Renderer — renders emoji characters to canvas ImageData for OL Icon styles.
 *
 * OL has no `divIcon` equivalent; markers are drawn on `<canvas>`. This utility
 * renders emoji text onto an offscreen canvas and returns it as an `HTMLCanvasElement`
 * suitable for `ol/style/Icon({ img })`.
 *
 * A canvas cache keyed by `${emoji}-${size}-${dpr}` avoids re-rendering the same
 * emoji. The backing store is sized at `devicePixelRatio` so glyphs stay crisp on
 * HiDPI displays and Windows display-scaling > 100%; drawing happens in logical
 * (CSS) px via `ctx.scale`, and callers size the OL `Icon` in logical px so it
 * composites 1:1 with the map's pixel-ratio-scaled canvas.
 */

const canvasCache = new Map<string, HTMLCanvasElement>();

/**
 * Render an emoji string (hex code or literal) to a square canvas.
 *
 * @param emoji  Emoji hex code (e.g. "1f4cd") or literal character
 * @param size   Logical (CSS px) side length; default 32. The returned canvas
 *               backing store is `size * devicePixelRatio` px.
 * @returns      An HTMLCanvasElement with the emoji drawn at center
 */
export function renderEmojiToCanvas(emoji: string, size = 32): HTMLCanvasElement {
  const dpr = window.devicePixelRatio || 1;
  const key = `${emoji}-${size}-${dpr}`;
  const cached = canvasCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);

  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${size * 0.75}px sans-serif`;

  // Convert hex code to emoji character if needed
  const char = emojiFromHex(emoji);

  // Center on the glyph's actual ink box, not the font's em box. `textBaseline`
  // values align to font metrics (em middle / alphabetic baseline) that leave
  // the visible glyph sitting high in the canvas — noticeable once a marker has
  // a concentric ring around it. Measuring the ink box and drawing to its centre
  // keeps the glyph centred on the feature point for any emoji.
  const m = ctx.measureText(char);
  // `|| 0` guards against a glyph/font that returns undefined metrics — the
  // fallback (drawing at size/2) matches the pre-measurement behavior.
  const inkLeft = m.actualBoundingBoxLeft || 0;
  const inkRight = m.actualBoundingBoxRight || 0;
  const inkAscent = m.actualBoundingBoxAscent || 0;
  const inkDescent = m.actualBoundingBoxDescent || 0;
  const drawX = size / 2 - (inkRight - inkLeft) / 2;
  const drawY = size / 2 + (inkAscent - inkDescent) / 2;

  // Soft black shadow behind the emoji character.
  // Draw twice so the soft shadow builds up enough contrast on light terrain,
  // then a final pass with the shadow disabled keeps the glyph itself crisp.
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = Math.max(2, size * 0.12);
  ctx.fillText(char, drawX, drawY);
  ctx.fillText(char, drawX, drawY);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.fillText(char, drawX, drawY);

  canvasCache.set(key, canvas);
  return canvas;
}

/**
 * Convert a hex emoji code (e.g. "1f4cd") to the actual character.
 * If the input is already a character or multi-codepoint, pass through.
 */
function emojiFromHex(input: string): string {
  // If it looks like a hex code (all hex digits, 4-5 chars), convert
  if (/^[0-9a-fA-F]{4,5}$/.test(input)) {
    return String.fromCodePoint(parseInt(input, 16));
  }
  // Multi-codepoint sequences separated by dashes (e.g. "1f468-200d-1f680")
  if (/^[0-9a-fA-F]+(-[0-9a-fA-F]+)+$/.test(input)) {
    return input
      .split("-")
      .map((cp) => String.fromCodePoint(parseInt(cp, 16)))
      .join("");
  }
  // Already a literal character
  return input;
}

/**
 * Render the lander SVG icon to a canvas.
 *
 * @param size  Logical (CSS px) side length. The returned canvas backing store
 *              is `size * devicePixelRatio` px so it stays crisp on HiDPI.
 * @returns     Promise resolving to the canvas (image loads async)
 */
export function renderLanderIconToCanvas(size: number): Promise<HTMLCanvasElement> {
  const dpr = window.devicePixelRatio || 1;
  const key = `lander-svg-${size}-${dpr}`;
  const cached = canvasCache.get(key);
  if (cached) return Promise.resolve(cached);

  const makeCanvas = (): [HTMLCanvasElement, CanvasRenderingContext2D | null] => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    return [canvas, canvas.getContext("2d")];
  };

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const [canvas, ctx] = makeCanvas();
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.drawImage(img, 0, 0, size, size);
      }
      canvasCache.set(key, canvas);
      resolve(canvas);
    };
    img.onerror = () => {
      // Fallback: empty canvas
      const [canvas] = makeCanvas();
      canvasCache.set(key, canvas);
      resolve(canvas);
    };
    img.src = "/images/lander.svg";
  });
}
