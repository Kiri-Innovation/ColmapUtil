/**
 * Image lookup: folder resolver (makeFolderImageResolver) or loadedFiles (resolveImageFromLoaded).
 * ZIP images via zipLoader imageProvider.
 */

const IMAGE_SUFFIX_PATTERN = /\.(jpe?g|png|gif|bmp|webp|tiff?)$/i;

function pathLooksLikeImage(path) {
  return IMAGE_SUFFIX_PATTERN.test(path);
}

/** Path suffix keys for O(1) lookup (e.g. "a/b/c.jpg" -> full path, "b/c.jpg", "c.jpg" + case variants). */
function pathSuffixKeysForLookup(filePath) {
  const unix = filePath.replace(/\\/g, '/');
  const segments = unix.split('/').filter(Boolean);
  const keys = new Set([unix, unix.toLowerCase()]);
  for (let i = 0; i < segments.length; i++) {
    const tail = segments.slice(i).join('/');
    keys.add(tail);
    keys.add(tail.toLowerCase());
  }
  return Array.from(keys);
}

function folderContainsMaskPaths(fileMap) {
  return Array.from(fileMap.keys()).some((p) => {
    const s = p.replace(/\\/g, '/').toLowerCase();
    return s.includes('masks/');
  });
}

/** Possible mask file path candidates for a given image path. */
function maskPathCandidates(imagePath) {
  const unix = imagePath.replace(/\\/g, '/');
  const withoutImagesPrefix = unix.replace(/^images\//i, '');
  const basename = withoutImagesPrefix.split('/').pop() || withoutImagesPrefix;
  const candidates = new Set();
  candidates.add(`masks/${withoutImagesPrefix}`);
  candidates.add(`masks/${withoutImagesPrefix}.png`);
  candidates.add(`masks/${basename}`);
  candidates.add(`masks/${basename}.png`);
  if (/images\//i.test(unix)) {
    const asMasks = unix.replace(/\/images\//gi, '/masks/').replace(/^images\//i, 'masks/');
    candidates.add(asMasks);
    candidates.add(asMasks + '.png');
  }
  return Array.from(candidates);
}

/** Folder image resolver: resolveImage, resolveMask, listMissing. files: path -> File. */
export function makeFolderImageResolver(files) {
  const byKey = new Map();
  let hasMasks = false;

  for (const [path, file] of files) {
    if (!pathLooksLikeImage(path)) continue;
    for (const k of pathSuffixKeysForLookup(path)) {
      if (!byKey.has(k)) byKey.set(k, file);
    }
  }
  hasMasks = folderContainsMaskPaths(files);

  function resolveImage(name) {
    if (!name) return undefined;
    const norm = name.replace(/\\/g, '/');
    return byKey.get(norm) ?? byKey.get(norm.toLowerCase());
  }

  function resolveMask(name) {
    if (!name) return undefined;
    const norm = name.replace(/\\/g, '/');
    for (const candidate of maskPathCandidates(norm)) {
      const file = byKey.get(candidate) ?? byKey.get(candidate.toLowerCase());
      if (file) return file;
    }
    return undefined;
  }

  function listMissing(images) {
    const missing = [];
    for (const img of images.values()) {
      if (!resolveImage(img.name)) missing.push({ imageId: img.imageId, name: img.name });
    }
    return { missingImages: missing, totalImages: images.size, totalFiles: byKey.size };
  }

  return {
    getImage: resolveImage,
    getMask: resolveMask,
    hasMasks: () => hasMasks,
    findMissing: listMissing,
  };
}

/** Sync: resolve image from loadedFiles (imageSource.getCached or imageResolver.getImage or imageFiles). */
export function resolveImageFromLoaded(loadedFiles, imageName) {
  if (!loadedFiles || !imageName) return undefined;
  if (loadedFiles.imageSource) {
    const c = loadedFiles.imageSource.getCached(imageName);
    if (c != null) return c;
  }
  if (loadedFiles.imageResolver) {
    const f = loadedFiles.imageResolver.getImage(imageName);
    if (f != null) return f;
  }
  if (loadedFiles.imageFiles) {
    const norm = imageName.replace(/\\/g, '/');
    return loadedFiles.imageFiles.get(norm) ?? loadedFiles.imageFiles.get(norm.toLowerCase());
  }
  return undefined;
}

/** Async: resolve image from loadedFiles (imageSource.getImage or imageResolver/imageFiles). */
export async function resolveImageFromLoadedAsync(loadedFiles, imageName) {
  if (!loadedFiles || !imageName) return null;
  if (loadedFiles.imageSource) {
    const c = await loadedFiles.imageSource.getImage(imageName);
    if (c != null) return c;
  }
  if (loadedFiles.imageResolver) {
    const f = loadedFiles.imageResolver.getImage(imageName);
    return f ? Promise.resolve(f) : Promise.resolve(null);
  }
  if (loadedFiles.imageFiles) {
    const norm = imageName.replace(/\\/g, '/');
    const f = loadedFiles.imageFiles.get(norm) ?? loadedFiles.imageFiles.get(norm.toLowerCase());
    return f ? Promise.resolve(f) : Promise.resolve(null);
  }
  return null;
}

/** True if loadedFiles use ZIP image source. */
export function loadedFilesUseZip(loadedFiles) {
  return !!(loadedFiles?.imageSource);
}

/** Async: resolve mask from loadedFiles. */
export async function resolveMaskFromLoadedAsync(loadedFiles, imageName) {
  if (!loadedFiles || !imageName) return null;
  if (loadedFiles.imageSource) {
    const m = await loadedFiles.imageSource.getMask(imageName);
    if (m != null) return m;
  }
  if (loadedFiles.imageResolver) {
    const f = loadedFiles.imageResolver.getMask(imageName);
    return f ? Promise.resolve(f) : Promise.resolve(null);
  }
  return null;
}

export function lookupImageByPath(imageFiles, imageName) {
  if (!imageFiles || !imageName) return undefined;
  const norm = imageName.replace(/\\/g, '/');
  return imageFiles.get(norm) ?? imageFiles.get(norm.toLowerCase());
}

export function lookupMaskByPath(imageFiles, imageName) {
  if (!imageFiles || !imageName) return undefined;
  const norm = imageName.replace(/\\/g, '/');
  for (const candidate of maskPathCandidates(norm)) {
    const f = imageFiles.get(candidate) ?? imageFiles.get(candidate.toLowerCase());
    if (f) return f;
  }
  return undefined;
}

export function listMissingImages(images, imageFiles) {
  const missing = [];
  for (const img of images.values()) {
    if (!lookupImageByPath(imageFiles, img.name)) missing.push({ imageId: img.imageId, name: img.name });
  }
  return { missingImages: missing, totalImages: images.size, totalFiles: imageFiles?.size ?? 0 };
}

/**
 * Build image path -> File Map for ZIP export from loadedFiles (imageFiles / imageResolver / imageSource).
 * images: Map from colmapData.images. Returns Map<string, File> for use with buildColmapArchive / saveColmapAsZip.
 */
export async function buildImageFilesForExport(loadedFiles, images) {
  if (!loadedFiles || !images?.size) return new Map();
  if (loadedFiles.imageFiles && loadedFiles.imageFiles.size > 0) {
    return new Map(loadedFiles.imageFiles);
  }
  const map = new Map();
  if (loadedFiles.imageResolver) {
    for (const img of images.values()) {
      const file = loadedFiles.imageResolver.getImage(img.name);
      if (file) map.set(img.name, file);
    }
    return map;
  }
  if (loadedFiles.imageSource) {
    for (const img of images.values()) {
      const file = await loadedFiles.imageSource.getImage(img.name);
      if (file) map.set(img.name, file);
    }
    return map;
  }
  return map;
}

export function folderHasMaskFiles(files) {
  return folderContainsMaskPaths(files);
}

/** Build image path index Map (path suffixes + case variants) from file Map. */
export function buildImagePathIndex(files) {
  const map = new Map();
  for (const [path, file] of files) {
    if (!pathLooksLikeImage(path)) continue;
    for (const k of pathSuffixKeysForLookup(path)) {
      if (!map.has(k)) map.set(k, file);
    }
  }
  return map;
}
