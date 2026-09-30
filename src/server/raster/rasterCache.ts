import { stat } from "node:fs/promises";

import { fromFile } from "geotiff";

type OpenTiff = Awaited<ReturnType<typeof fromFile>>;
type RasterImage = Awaited<ReturnType<OpenTiff["getImage"]>>;

type CacheEntry = {
  key: string;
  tiff: OpenTiff;
  image: RasterImage;
};

const MAX_OPEN_RASTERS = 8;
// Map insertion order supplies a small least-recently-used cache without a separate linked list.
const entries = new Map<string, CacheEntry>();
// Concurrent requests for the same file share one open operation and file descriptor.
const pending = new Map<string, Promise<CacheEntry>>();

const closeTiff = async (tiff: OpenTiff): Promise<void> => {
  await tiff.close();
};

const evictOldest = async (): Promise<void> => {
  const oldestKey = entries.keys().next().value as string | undefined;
  if (!oldestKey) return;

  const oldest = entries.get(oldestKey);
  entries.delete(oldestKey);
  if (oldest) await closeTiff(oldest.tiff);
};

export const getCachedRaster = async (
  absolutePath: string
): Promise<{ tiff: OpenTiff; image: RasterImage }> => {
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) throw new Error("Raster path is not a regular file");

  const key = `${absolutePath}:${fileStat.mtimeMs}:${fileStat.size}`;
  const cached = entries.get(key);
  if (cached) {
    // Reinsert the entry so it becomes the most recently used item in Map iteration order.
    entries.delete(key);
    entries.set(key, cached);
    return cached;
  }

  // File metadata is part of the key so replacing a raster invalidates its open decoder.
  const stale = [...entries.entries()].find(([, entry]) =>
    entry.key.startsWith(`${absolutePath}:`)
  );
  if (stale) {
    entries.delete(stale[0]);
    await closeTiff(stale[1].tiff);
  }

  let opening = pending.get(key);
  if (!opening) {
    opening = (async () => {
      // getImage() selects the primary image; overview images are not used for exact elevation
      // lookup because their downsampling would alter source cell values.
      const tiff = await fromFile(absolutePath);
      try {
        const image = await tiff.getImage();
        return { key, tiff, image };
      } catch (error) {
        await closeTiff(tiff);
        throw error;
      }
    })();
    pending.set(key, opening);
  }

  try {
    const entry = await opening;
    entries.set(key, entry);
    while (entries.size > MAX_OPEN_RASTERS) await evictOldest();
    return entry;
  } finally {
    pending.delete(key);
  }
};

export const closeRasterCache = async (): Promise<void> => {
  const openEntries = [...entries.values()];
  entries.clear();
  pending.clear();
  await Promise.all(openEntries.map(({ tiff }) => closeTiff(tiff)));
};
