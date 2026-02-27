/**
 * Load COLMAP from ZIP: extract sparse files and build lazy image provider.
 * Uses @zip.js/zip.js (no WASM/worker).
 */

import { ZipReader, BlobReader, BlobWriter } from '@zip.js/zip.js';

const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const IMAGE_EXT_REGEX = /\.(jpe?g|png|gif|bmp|webp|tiff?)$/i;
const SPARSE_FILE_BASENAMES = new Set([
  'cameras.bin', 'cameras.txt', 'images.bin', 'images.txt',
  'points3d.bin', 'points3d.txt', 'rigs.bin', 'rigs.txt', 'frames.bin', 'frames.txt',
]);

export const MAX_ZIP_BYTES = MAX_ARCHIVE_BYTES;

export function isZipFile(file) {
  const name = file.name.toLowerCase();
  return name.endsWith('.zip') || file.type === 'application/zip';
}

export function checkZipSizeLimit(file) {
  if (file.size > MAX_ARCHIVE_BYTES) {
    const limitMb = (MAX_ARCHIVE_BYTES / (1024 * 1024)).toFixed(0);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return { valid: false, size: file.size, error: `ZIP exceeds ${limitMb}MB (current ${sizeMb}MB)` };
  }
  return { valid: true, size: file.size };
}

function pathLooksLikeImage(path) {
  return IMAGE_EXT_REGEX.test(path);
}

function pathIsSparseColmapFile(path) {
  const base = path.split('/').pop()?.toLowerCase() ?? '';
  return SPARSE_FILE_BASENAMES.has(base);
}

/** Sparse segment key or default sparse/0/filename. */
function colmapSparsePathKey(path, filename) {
  const i = path.indexOf('sparse/');
  if (i === -1) return `sparse/0/${filename}`;
  const seg = path.slice(i);
  const parts = seg.split('/');
  if (parts.length >= 2 && /^\d+$/.test(parts[1])) return seg;
  return `sparse/0/${filename}`;
}

/** Load COLMAP from ZIP; extract sparse files and build lazy image source. Returns { sparseFiles, imageSource }. */
export async function loadColmapFromZip(zipFile) {
  const v = checkZipSizeLimit(zipFile);
  if (!v.valid) throw new Error(v.error ?? 'Invalid ZIP');

  const zipReader = new ZipReader(new BlobReader(zipFile));
  const allEntries = await zipReader.getEntries();

  const sparseEntries = [];
  const imageEntryMap = new Map();

  for (const entry of allEntries) {
    if (entry.directory) continue;
    const full = entry.filename.replace(/\\/g, '/');
    if (pathIsSparseColmapFile(full)) {
      sparseEntries.push(entry);
    } else if (pathLooksLikeImage(full)) {
      imageEntryMap.set(full, entry);
      const base = full.split('/').pop() ?? full;
      if (!imageEntryMap.has(base)) imageEntryMap.set(base, entry);
    }
  }

  const sparseFiles = new Map();
  for (const entry of sparseEntries) {
    const blob = await entry.getData(new BlobWriter());
    const filename = entry.filename.split('/').pop() ?? entry.filename;
    const file = new File([blob], filename, { type: 'application/octet-stream' });
    sparseFiles.set(colmapSparsePathKey(entry.filename, filename), file);
  }

  const required = ['cameras', 'images', 'points3d'];
  const found = new Set();
  for (const k of sparseFiles.keys()) {
    const basename = k.split('/').pop() ?? k;
    const base = basename.toLowerCase().replace(/\.[^.]+$/, '');
    if (required.includes(base)) found.add(base);
  }
  const missing = required.filter((b) => !found.has(b));
  if (missing.length) {
    await zipReader.close();
    throw new Error(`ZIP missing: ${missing.join(' / ')}`);
  }

  const imageSource = makeLazyZipImageProvider(zipReader, imageEntryMap);
  return { sparseFiles, imageSource };
}

function findZipEntryByImageName(name, entryMap) {
  const norm = name.replace(/\\/g, '/');
  const lower = norm.toLowerCase();
  const filename = norm.split('/').pop() || norm;

  if (entryMap.has(norm)) return entryMap.get(norm);
  if (entryMap.has(lower)) return entryMap.get(lower);
  if (entryMap.has(filename)) return entryMap.get(filename);

  const fnLower = filename.toLowerCase();
  for (const [key, entry] of entryMap) {
    const k = key.toLowerCase();
    if (k === lower) return entry;
    if (k.endsWith('/' + lower)) return entry;
    if (fnLower && (k.endsWith('/' + fnLower) || k === fnLower)) return entry;
  }
  return null;
}

function zipMaskPathCandidates(imagePath) {
  const unix = imagePath.replace(/\\/g, '/');
  const noLeadingImages = /^images\//i.test(unix) ? unix.slice(7) : unix;
  const basename = noLeadingImages.split('/').pop() || noLeadingImages;
  const result = new Set();

  result.add(`masks/${noLeadingImages}`);
  result.add(`masks/${noLeadingImages}.png`);
  result.add(`masks/${basename}`);
  result.add(`masks/${basename}.png`);
  if (unix !== noLeadingImages) {
    const swapped = unix.replace(/\/?images\//i, '/masks/').replace(/^images\//i, 'masks/');
    result.add(swapped);
    result.add(swapped + '.png');
  }
  return [...result];
}

function computeThumbDimensions(bitmap) {
  const maxSide = 1536;
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio
    ? Math.min(window.devicePixelRatio, 2)
    : 1;
  const refW = typeof screen !== 'undefined' ? screen.width : 1280;
  const refH = typeof screen !== 'undefined' ? screen.height : 720;
  const cap = Math.min(Math.max(refW, refH) * dpr, maxSide);
  const needsScale = bitmap.width > cap || bitmap.height > cap;
  const ratio = needsScale ? cap / Math.max(bitmap.width, bitmap.height) : 1;
  return {
    w: Math.round(bitmap.width * ratio),
    h: Math.round(bitmap.height * ratio),
  };
}

async function compressToJpeg(blob, filename) {
  try {
    const bitmap = await createImageBitmap(blob);
    const { w, h } = computeThumbDimensions(bitmap);
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; })();
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return new File([blob], filename, { type: blob.type || 'image/png' });
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const quality = 0.82;
    const outBlob = canvas.convertToBlob
      ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
      : await new Promise((ok, err) => {
          canvas.toBlob((b) => (b ? ok(b) : err(new Error('toBlob failed'))), 'image/jpeg', quality);
        });
    const jpgName = filename.includes('.') ? filename.replace(/\.[^.]+$/, '.jpg') : filename + '.jpg';
    return new File([outBlob], jpgName, { type: 'image/jpeg' });
  } catch (err) {
    console.warn('[ZIP Image] Compression failed, using original:', err);
    return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  }
}

/** Lazy ZIP image provider: on-demand extract + cache. Keeps zipReader open until dispose. */
function makeLazyZipImageProvider(zipReader, entryMap) {
  const imageCache = new Map();
  const maskCache = new Map();
  const inFlight = new Map();
  let disposed = false;

  async function pullImage(name) {
    const entry = findZipEntryByImageName(name, entryMap);
    if (!entry) return null;
    try {
      const blob = await entry.getData(new BlobWriter());
      const baseName = name.split('/').pop() || name;
      const file = await compressToJpeg(blob, baseName);
      imageCache.set(name, file);
      return file;
    } catch (e) {
      console.warn(`[ZIP] Extract failed: ${name}`, e);
      return null;
    }
  }

  async function getImage(name) {
    if (disposed) return null;
    const cached = imageCache.get(name);
    if (cached) return cached;
    let p = inFlight.get(name);
    if (p) return p;
    p = pullImage(name);
    inFlight.set(name, p);
    try {
      return await p;
    } finally {
      inFlight.delete(name);
    }
  }

  function getCached(name) {
    return imageCache.get(name);
  }

  async function getMask(imageName) {
    if (disposed) return null;
    const cached = maskCache.get(imageName);
    if (cached) return cached;
    const norm = imageName.replace(/\\/g, '/');
    for (const path of zipMaskPathCandidates(norm)) {
      const entry = findZipEntryByImageName(path, entryMap);
      if (entry) {
        try {
          const blob = await entry.getData(new BlobWriter());
          const filename = path.split('/').pop() || path;
          const file = new File([blob], filename, { type: blob.type || 'image/png' });
          maskCache.set(imageName, file);
          return file;
        } catch (_) {}
      }
    }
    return null;
  }

  async function clear() {
    disposed = true;
    imageCache.clear();
    maskCache.clear();
    inFlight.clear();
    if (zipReader) await zipReader.close();
  }

  return {
    getImage,
    getCached,
    getMask,
    clear,
    dispose: clear,
  };
}
