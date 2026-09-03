import {
  parsePoints3DBinary,
  parsePoints3DText,
  parseImagesBinary,
  parseImagesText,
  parseCamerasBinary,
  parseCamerasText,
  parseRigsBinary,
  parseRigsText,
  parseFramesBinary,
  parseFramesText,
  parseTimesBinary,
  parseTimesText,
  parsePointsTBinary,
  parsePointsTText,
  parseTimeMetaText,
} from '../../codec/parse/colmapDataCodec.js';
import { computeImageStats } from '../../codec/stats/colmapStatsCalc.js';
import { getToast } from '../../AppContext.jsx';
import { settings } from '../../utils/settings.js';
import { makeFolderImageResolver } from '../../utils/imageFileUtils.js';
import { getFailedDecodeCount, clearDecodeFailures } from '../../utils/textureCaching.js';
import { clearThumbnailCache } from '../sidebar/Thumbnail.jsx';
import { clearFrustumCache } from '../visualizer/ImageTextureManager.js';
import { cameraWorldPositionFromPose } from '../../utils/colmapTransforms.js';
import { isZipFile, loadColmapFromZip } from '../../utils/zipLoader.js';

function fileMapHasRasterImagePaths(fileMap) {
  if (!fileMap || typeof fileMap.keys !== 'function') return false;
  for (const k of fileMap.keys()) {
    if (/\.(jpe?g|png|gif|bmp|webp|tiff?)$/i.test(String(k))) return true;
  }
  return false;
}

/** 多数据集合并后是否允许视锥图像纹理（任一为 true/legacy 即 true；全为 false 则 false）。 */
function mergedCanResolveRasterImages(visibleEntries) {
  return visibleEntries.some((e) => {
    const v = e?.parsedBundle?.loadedFiles?.canResolveRasterImages;
    if (v === true) return true;
    if (v === false) return false;
    return true;
  });
}

/**
 * Estimate frustum display scale from scene bounding box and camera count.
 * Scale ~ radius / n^0.4 so sparse scenes appear larger, dense scenes smaller.
 */
function deriveFrustumDisplayScale(images) {
  if (images.size === 0) return 0.25;

  const poses = [];
  for (const img of images.values()) {
    poses.push(cameraWorldPositionFromPose(img));
  }

  if (poses.length === 1) {
    const p = poses[0];
    const r = Math.hypot(p.x, p.y, p.z);
    return Math.max(r * 0.08, 0.08);
  }

  let cx = 0, cy = 0, cz = 0;
  for (const p of poses) {
    cx += p.x; cy += p.y; cz += p.z;
  }
  cx /= poses.length;
  cy /= poses.length;
  cz /= poses.length;

  let maxDist = 0;
  for (const p of poses) {
    const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
    if (d > maxDist) maxDist = d;
  }
  const radius = Math.max(maxDist, 1e-6);

  const n = poses.length;
  const densityFactor = Math.pow(n, -0.4);
  let scale = radius * densityFactor * 0.15;

  const lo = radius * 0.003;
  const hi = radius * 0.12;
  scale = Math.max(lo, Math.min(hi, scale));
  return Math.max(scale, 0.08);
}

/**
 * Parse colmap4d time sidecars (if present in `chosen`) and join `t` onto the entity objects:
 * each image gets `.t` (BigInt ns | null=timeless), each point gets `.t` (BigInt ns | null).
 * Because `t` lives on the entity objects, it rides the `{...image}`/`{...point}` spreads through
 * the multi-dataset merge remap for free. Returns the parsed time_meta (or null). Best-effort:
 * a sidecar parse failure never breaks base-model loading (backward compatibility).
 */
async function loadSidecarsAndJoin(chosen, images, pointCloud) {
  let timeMeta = null;
  try {
    if (chosen?.timesFile) {
      const timesMap = chosen.timesFile.name.endsWith('.bin')
        ? await chosen.timesFile.arrayBuffer().then(parseTimesBinary)
        : await chosen.timesFile.text().then(parseTimesText);
      for (const img of images.values()) {
        img.t = timesMap.has(img.imageId) ? timesMap.get(img.imageId) : null;
      }
    }
    if (chosen?.pointsTFile && pointCloud) {
      const ptMap = chosen.pointsTFile.name.endsWith('.bin')
        ? await chosen.pointsTFile.arrayBuffer().then(parsePointsTBinary)
        : await chosen.pointsTFile.text().then(parsePointsTText);
      for (const pt of pointCloud.values()) {
        pt.t = ptMap.has(pt.point3DId) ? ptMap.get(pt.point3DId) : null;
      }
    }
    if (chosen?.timeMetaFile) {
      timeMeta = await chosen.timeMetaFile.text().then(parseTimeMetaText);
    }
  } catch (err) {
    console.warn('Parse time sidecars failed (ignored):', err);
  }
  return timeMeta;
}

/**
 * Returns drop/browse handlers (handleDrop, handleDragOver, processFiles, processZipFile, handleBrowse) from AppContext.
 */
export function handleFileDrop(context) {
  const {
    colmapData,
    datasetEntries,
    activeDatasetEntryId,
    setColmapData,
    setLoadedFiles,
    setDroppedFiles,
    setDatasetEntries,
    setActiveDatasetEntryId,
    setLoading,
    setError,
    setSourceInfo,
    sourceTypeRef,
  } = context;
  const toast = getToast();

  const resetView = () => {
    if (window.__colmapContextRefs?.resetView) {
      window.__colmapContextRefs.resetView();
    }
  };
  const closeImageDetail = () => {
    if (window.__colmapContextRefs?.closeImageDetail) {
      window.__colmapContextRefs.closeImageDetail();
    }
  };
  const setSelectedImageId = (id) => {
    if (window.__colmapContextRefs?.setSelectedImageId) {
      window.__colmapContextRefs.setSelectedImageId(id);
    }
  };
  const setCameraScale = (scale) => settings.camera.set('cameraScale', scale);

  /**
   * Collect all files under a dropped directory (iterative queue to avoid deep recursion).
   * entry is FileSystemEntry (from webkitGetAsEntry); fileAccumulator is path -> File Map.
   */
  async function collectFilesFromEntry(entry, baseDir, fileAccumulator) {
    const prefix = baseDir ? `${baseDir}/` : '';
    const relPath = prefix + entry.name;

    if (entry.isFile) {
      const f = await new Promise((ok, err) => entry.file(ok, err));
      fileAccumulator.set(relPath, f);
      return;
    }

    if (!entry.isDirectory) return;
    const reader = entry.createReader();

    let pending = [];
    let batch;
    do {
      batch = await new Promise((ok, err) => reader.readEntries(ok, err));
      pending.push(...batch);
    } while (batch.length > 0);

    for (let k = 0; k < pending.length; k += 32) {
      const slice = pending.slice(k, k + 32);
      await Promise.all(
        slice.map((child) => collectFilesFromEntry(child, relPath, fileAccumulator))
      );
    }
  }

  /**
   * Pick COLMAP reconstruction directory from file set.
   * Prefer shallowest path by depth; at same depth prefer path containing "sparse".
   */
  function pickColmapDirectory(fileMap) {
    const byDir = new Map();
    for (const [path, file] of fileMap) {
      const slash = path.lastIndexOf('/');
      const dir = slash >= 0 ? path.slice(0, slash) : '';
      const name = file.name.toLowerCase();

      if (!byDir.has(dir)) byDir.set(dir, {});
      const bag = byDir.get(dir);

      const preferBin = (cur) => !cur?.name.endsWith('.bin');
      if (name === 'cameras.bin' || (name === 'cameras.txt' && preferBin(bag.cameras))) bag.cameras = file;
      else if (name === 'images.bin' || (name === 'images.txt' && preferBin(bag.images))) bag.images = file;
      else if (name === 'points3d.bin' || (name === 'points3d.txt' && preferBin(bag.points3D))) bag.points3D = file;
      else if (name === 'database.db' || name === 'colmap.db') bag.database = file;
      else if (name === 'rigs.bin' || (name === 'rigs.txt' && preferBin(bag.rigs))) bag.rigs = file;
      else if (name === 'frames.bin' || (name === 'frames.txt' && preferBin(bag.frames))) bag.frames = file;
      // colmap4d time sidecars (exact stems only)
      else if (name === 'times.bin' || (name === 'times.txt' && preferBin(bag.times))) bag.times = file;
      else if (name === 'points_t.bin' || (name === 'points_t.txt' && preferBin(bag.pointsT))) bag.pointsT = file;
      else if (name === 'time_meta.json') bag.timeMeta = file;
    }

    const candidates = [];
    for (const [dir, bag] of byDir) {
      if (bag.cameras && bag.images && bag.points3D) {
        const depth = (dir.match(/\//g) || []).length;
        const hasSparse = dir.toLowerCase().includes('sparse');
        candidates.push({ dir, bag, depth, hasSparse });
      }
    }
    if (candidates.length === 0) return {};

    candidates.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return (b.hasSparse ? 1 : 0) - (a.hasSparse ? 1 : 0);
    });
    const chosen = candidates[0].bag;
    return {
      directoryPath: candidates[0].dir,
      camerasFile: chosen.cameras,
      imagesFile: chosen.images,
      points3DFile: chosen.points3D,
      databaseFile: chosen.database,
      rigsFile: chosen.rigs,
      framesFile: chosen.frames,
      timesFile: chosen.times,
      pointsTFile: chosen.pointsT,
      timeMetaFile: chosen.timeMeta,
    };
  }

  function makeDatasetEntry(id, folderName, chosen, active = false, source = null, visualized = false, parsedBundle = null) {
    const hasColmap = !!(chosen?.camerasFile && chosen?.imagesFile && chosen?.points3DFile);
    return {
      id,
      folderName,
      hasColmap,
      colmapDirectoryPath: chosen?.directoryPath ?? null,
      source,
      visualized,
      parsedBundle,
      active,
    };
  }

  function makeDatasetId(prefix) {
    return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Insert _n before extension for files like foo.zip → foo_1.zip; folders use foo_1. */
  function displayNameWithNumericSuffix(baseName, n) {
    if (n === 0) return baseName;
    const dot = baseName.lastIndexOf('.');
    if (dot > 0 && dot < baseName.length - 1) {
      return `${baseName.slice(0, dot)}_${n}${baseName.slice(dot)}`;
    }
    return `${baseName}_${n}`;
  }

  /** Assign a unique sidebar label against existing + in-batch names. */
  function allocateUniqueDisplayName(baseName, usedNames) {
    if (!usedNames.has(baseName)) {
      usedNames.add(baseName);
      return baseName;
    }
    let n = 1;
    while (true) {
      const candidate = displayNameWithNumericSuffix(baseName, n);
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
      n += 1;
    }
  }

  /** Append new datasets without replacing; duplicate base names get _1, _2, … */
  function appendDatasetsWithUniqueDisplayNames(newEntries, keepActiveId) {
    if (!newEntries.length) return;
    const current = Array.isArray(datasetEntries) ? datasetEntries : [];
    const usedNames = new Set(current.map((e) => e.folderName));
    const withUnique = newEntries.map((entry) => {
      const base = entry.folderName;
      const uniqueName = allocateUniqueDisplayName(base, usedNames);
      return { ...entry, folderName: uniqueName };
    });
    const merged = [...current, ...withUnique];
    const normalized = merged.map((entry) => ({ ...entry, active: entry.id === keepActiveId }));
    setDatasetEntries(normalized);
    setActiveDatasetEntryId(keepActiveId);
  }

  function cloneImagesWithPointRemap(images, cameraIdMap, pointIdMap, imageIdMap, datasetPrefix) {
    const out = new Map();
    for (const image of images.values()) {
      const newImageId = imageIdMap.get(image.imageId);
      if (newImageId == null) continue;
      const newCameraId = cameraIdMap.get(image.cameraId);
      if (newCameraId == null) continue;
      const points2D = (image.points2D || []).map((p) => {
        const oldPointId = p.point3DId;
        let point3DId = BigInt(-1);
        if (oldPointId !== BigInt(-1) && pointIdMap.has(oldPointId)) {
          point3DId = pointIdMap.get(oldPointId);
        }
        return {
          ...p,
          point3DId,
        };
      });
      out.set(newImageId, {
        ...image,
        imageId: newImageId,
        cameraId: newCameraId,
        name: `${datasetPrefix}/${image.name}`,
        points2D,
      });
    }
    return out;
  }

  function clonePointCloudWithRemap(pointCloud, pointIdMap, imageIdMap) {
    const out = new Map();
    if (!pointCloud) return out;
    for (const point of pointCloud.values()) {
      const newPointId = pointIdMap.get(point.point3DId);
      if (newPointId == null) continue;
      const track = (point.track || [])
        .map((obs) => {
          const mapped = imageIdMap.get(obs.imageId);
          if (mapped == null) return null;
          return {
            ...obs,
            imageId: mapped,
          };
        })
        .filter(Boolean);
      out.set(newPointId, {
        ...point,
        point3DId: newPointId,
        track,
      });
    }
    return out;
  }

  function buildMergedResolver(visibleEntries) {
    const resolvers = [];
    for (const entry of visibleEntries) {
      const resolver = entry?.parsedBundle?.loadedFiles?.imageResolver;
      if (!resolver) continue;
      resolvers.push({ prefix: `${entry.id}/`, resolver });
    }
    return {
      getImage(name) {
        const norm = String(name || '').replace(/\\/g, '/');
        for (const item of resolvers) {
          if (!norm.startsWith(item.prefix)) continue;
          const localName = norm.slice(item.prefix.length);
          return item.resolver.getImage(localName);
        }
        return undefined;
      },
      getMask(name) {
        const norm = String(name || '').replace(/\\/g, '/');
        for (const item of resolvers) {
          if (!norm.startsWith(item.prefix)) continue;
          const localName = norm.slice(item.prefix.length);
          return item.resolver.getMask(localName);
        }
        return undefined;
      },
      hasMasks() {
        return resolvers.some((r) => r.resolver.hasMasks?.());
      },
      findMissing(images) {
        const missing = [];
        for (const img of images.values()) {
          if (!this.getImage(img.name)) {
            missing.push({ imageId: img.imageId, name: img.name });
          }
        }
        return { missingImages: missing, totalImages: images.size, totalFiles: 0 };
      },
    };
  }

  /** ZIP 使用 loadedFiles.imageSource；合并多数据集时必须带上，否则画廊/视锥无纹理。 */
  function buildMergedZipImageSource(visibleEntries) {
    const items = [];
    for (const entry of visibleEntries) {
      const src = entry?.parsedBundle?.loadedFiles?.imageSource;
      if (!src) continue;
      items.push({ prefix: `${entry.id}/`, src });
    }
    if (items.length === 0) return null;
    return {
      getCached(name) {
        const norm = String(name || '').replace(/\\/g, '/');
        for (const it of items) {
          if (!norm.startsWith(it.prefix)) continue;
          const localName = norm.slice(it.prefix.length);
          return it.src.getCached(localName);
        }
        return undefined;
      },
      getImage(name) {
        const norm = String(name || '').replace(/\\/g, '/');
        for (const it of items) {
          if (!norm.startsWith(it.prefix)) continue;
          const localName = norm.slice(it.prefix.length);
          return it.src.getImage(localName);
        }
        return Promise.resolve(null);
      },
      getMask(name) {
        const norm = String(name || '').replace(/\\/g, '/');
        for (const it of items) {
          if (!norm.startsWith(it.prefix)) continue;
          const localName = norm.slice(it.prefix.length);
          return it.src.getMask(localName);
        }
        return Promise.resolve(null);
      },
      dispose() {
        for (const it of items) {
          try {
            it.src.dispose?.();
          } catch (err) {
            console.warn('Merged zip imageSource dispose failed:', err);
          }
        }
      },
    };
  }

  function rebuildVisualizationFromEntries(entries) {
    const visible = entries.filter((e) => e.visualized && e.parsedBundle?.colmapData);
    if (visible.length === 0) {
      setColmapData(null);
      setLoadedFiles(null);
      closeImageDetail();
      setSelectedImageId(null);
      return;
    }

    const mergedCameras = new Map();
    const mergedImages = new Map();
    const mergedPointCloud = new Map();

    let nextCameraId = 1;
    let nextImageId = 1;
    let nextPointId = BigInt(1);

    for (const entry of visible) {
      const data = entry.parsedBundle.colmapData;
      const cameraIdMap = new Map();
      const imageIdMap = new Map();
      const pointIdMap = new Map();

      for (const cam of data.cameras.values()) {
        const newId = nextCameraId++;
        cameraIdMap.set(cam.cameraId, newId);
        mergedCameras.set(newId, { ...cam, cameraId: newId });
      }

      for (const img of data.images.values()) {
        const newId = nextImageId++;
        imageIdMap.set(img.imageId, newId);
      }

      const pointCloud = data.pointCloud || new Map();
      for (const pt of pointCloud.values()) {
        const newPointId = nextPointId;
        nextPointId += BigInt(1);
        pointIdMap.set(pt.point3DId, newPointId);
      }

      const remappedImages = cloneImagesWithPointRemap(
        data.images,
        cameraIdMap,
        pointIdMap,
        imageIdMap,
        entry.id
      );
      const remappedPoints = clonePointCloudWithRemap(pointCloud, pointIdMap, imageIdMap);

      for (const [id, img] of remappedImages) mergedImages.set(id, img);
      for (const [id, pt] of remappedPoints) mergedPointCloud.set(id, pt);
    }

    const statsResult = computeImageStats(mergedImages, mergedPointCloud);
    let pointCloudAverageError = 0;
    if (mergedPointCloud.size > 0) {
      let sum = 0;
      let cnt = 0;
      for (const pt of mergedPointCloud.values()) {
        if (pt.error >= 0) {
          sum += pt.error;
          cnt++;
        }
      }
      pointCloudAverageError = cnt > 0 ? sum / cnt : 0;
    }

    // Per-image / per-point `t` already rode the {...image}/{...point} spreads in the remap
    // clones; carry the top-level time_meta from the first visible entry that has one.
    const mergedTimeMeta = visible.find((e) => e.parsedBundle?.colmapData?.timeMeta)
      ?.parsedBundle?.colmapData?.timeMeta ?? null;

    const colmapDataMerged = {
      cameras: mergedCameras,
      images: mergedImages,
      ...(mergedPointCloud.size > 0 && { pointCloud: mergedPointCloud }),
      ...(mergedTimeMeta && { timeMeta: mergedTimeMeta }),
      pointCloudPointCount: mergedPointCloud.size,
      pointCloudTotalObservations: statsResult.pointCloudTotalObservations,
      pointCloudAverageError,
      imageNumPoints3D: statsResult.imageNumPoints3D,
      imageAvgError: statsResult.imageAvgError,
      imageCovisibleCount: statsResult.imageCovisibleCount,
      imagePairCovisibilityCount: statsResult.imagePairCovisibilityCount,
      pointCloudIdsByImage: statsResult.pointCloudIdsByImage,
    };

    const mergedResolver = buildMergedResolver(visible);
    const mergedZipSource = buildMergedZipImageSource(visible);
    setLoadedFiles({
      imageResolver: mergedResolver,
      ...(mergedZipSource && { imageSource: mergedZipSource }),
      canResolveRasterImages: mergedCanResolveRasterImages(visible),
    });
    setColmapData(colmapDataMerged);
    const scale = deriveFrustumDisplayScale(mergedImages);
    setCameraScale(scale);
    resetView();
  }

  async function parseDatasetEntry(entry) {
    if (entry.parsedBundle) return entry.parsedBundle;
    if (!entry.hasColmap || !entry.source) return null;

    let files = null;
    if (entry.source.type === 'zip') {
      const zipFile = entry.source.zipFile;
      if (!zipFile) return null;
      const { sparseFiles, imageSource } = await loadColmapFromZip(zipFile, {
        noImage: !!entry.source.noImage,
      });
      files = sparseFiles;
      const chosen = pickColmapDirectory(files);
      const parsedBundle = await parseChosenFiles(files, chosen, imageSource);
      return parsedBundle;
    }

    files = entry.source.files;
    const chosen = entry.source.chosen || pickColmapDirectory(files);
    const parsedBundle = await parseChosenFiles(files, chosen, null);
    return parsedBundle;
  }

  async function parseChosenFiles(files, chosen, zipImageSource = null) {
    if (!chosen?.camerasFile || !chosen?.imagesFile || !chosen?.points3DFile) {
      throw new Error('Missing required COLMAP files. Need cameras, images, points3D (.bin or .txt)');
    }

    let folderResolver = null;
    let loadedFilesObj = null;
    if (zipImageSource) {
      loadedFilesObj = {
        camerasFile: chosen.camerasFile,
        imagesFile: chosen.imagesFile,
        points3DFile: chosen.points3DFile,
        databaseFile: chosen.databaseFile,
        rigsFile: chosen.rigsFile,
        framesFile: chosen.framesFile,
        imageSource: zipImageSource,
      };
    } else {
      folderResolver = makeFolderImageResolver(files);
      loadedFilesObj = {
        camerasFile: chosen.camerasFile,
        imagesFile: chosen.imagesFile,
        points3DFile: chosen.points3DFile,
        databaseFile: chosen.databaseFile,
        rigsFile: chosen.rigsFile,
        framesFile: chosen.framesFile,
        imageResolver: folderResolver,
      };
    }
    loadedFilesObj.canResolveRasterImages = !!zipImageSource || fileMapHasRasterImagePaths(files);

    const [cameras, images, points3D] = await Promise.all([
      chosen.camerasFile.name.endsWith('.bin')
        ? chosen.camerasFile.arrayBuffer().then(parseCamerasBinary)
        : chosen.camerasFile.text().then(parseCamerasText),
      chosen.imagesFile.name.endsWith('.bin')
        ? chosen.imagesFile.arrayBuffer().then((buf) => parseImagesBinary(buf, false))
        : chosen.imagesFile.text().then(parseImagesText),
      chosen.points3DFile.name.endsWith('.bin')
        ? chosen.points3DFile.arrayBuffer().then(parsePoints3DBinary)
        : chosen.points3DFile.text().then(parsePoints3DText),
    ]);

    const statsResult = computeImageStats(images, points3D);
    let rigData;
    if (chosen.rigsFile && chosen.framesFile) {
      try {
        const [rigs, frames] = await Promise.all([
          chosen.rigsFile.name.endsWith('.bin')
            ? chosen.rigsFile.arrayBuffer().then(parseRigsBinary)
            : chosen.rigsFile.text().then(parseRigsText),
          chosen.framesFile.name.endsWith('.bin')
            ? chosen.framesFile.arrayBuffer().then(parseFramesBinary)
            : chosen.framesFile.text().then(parseFramesText),
        ]);
        rigData = { rigs, frames };
      } catch (err) {
        console.warn('Parse rig/frame failed:', err);
      }
    }

    const pointCloud = points3D || null;
    const timeMeta = await loadSidecarsAndJoin(chosen, images, pointCloud);
    let pointCloudAverageError = 0;
    if (pointCloud && pointCloud.size > 0) {
      let sum = 0;
      let cnt = 0;
      for (const pt of pointCloud.values()) {
        if (pt.error >= 0) {
          sum += pt.error;
          cnt++;
        }
      }
      pointCloudAverageError = cnt > 0 ? sum / cnt : 0;
    }

    const colmapDataParsed = {
      cameras,
      images,
      ...(pointCloud && pointCloud.size > 0 && { pointCloud }),
      ...(timeMeta && { timeMeta }),
      rigData,
      pointCloudPointCount: pointCloud?.size ?? 0,
      pointCloudTotalObservations: statsResult.pointCloudTotalObservations,
      pointCloudAverageError,
      imageNumPoints3D: statsResult.imageNumPoints3D,
      imageAvgError: statsResult.imageAvgError,
      imageCovisibleCount: statsResult.imageCovisibleCount,
      imagePairCovisibilityCount: statsResult.imagePairCovisibilityCount,
      pointCloudIdsByImage: statsResult.pointCloudIdsByImage,
    };

    return { colmapData: colmapDataParsed, loadedFiles: loadedFilesObj };
  }

  async function toggleDatasetVisualization(datasetId) {
    const currentEntries = datasetEntries || [];
    const target = currentEntries.find((e) => e.id === datasetId);
    if (!target || !target.hasColmap) return;

    setLoading(true);
    try {
      let parsedBundle = target.parsedBundle;
      const shouldVisualize = !target.visualized;
      if (shouldVisualize && !parsedBundle) {
        parsedBundle = await parseDatasetEntry(target);
      }

      const nextEntries = currentEntries.map((entry) => {
        if (entry.id !== datasetId) return entry;
        return {
          ...entry,
          parsedBundle: parsedBundle ?? entry.parsedBundle,
          visualized: shouldVisualize,
          active: entry.id === datasetId,
        };
      }).map((entry) => ({ ...entry, active: entry.id === datasetId }));

      setDatasetEntries(nextEntries);
      setActiveDatasetEntryId(datasetId);
      rebuildVisualizationFromEntries(nextEntries);
    } catch (err) {
      console.error('Toggle dataset failed:', err);
      setError(err instanceof Error ? err.message : 'Toggle dataset failed');
    } finally {
      setLoading(false);
    }
  }

  /** Update sidebar label; enforces uniqueness vs other entries (may add _1, _2, …). */
  function renameDatasetDisplayName(datasetId, rawInput) {
    const trimmed = (rawInput ?? '').trim();
    if (!trimmed) return;

    const current = Array.isArray(datasetEntries) ? datasetEntries : [];
    const target = current.find((e) => e.id === datasetId);
    if (!target) return;

    const usedNames = new Set(
      current.filter((e) => e.id !== datasetId).map((e) => e.folderName)
    );
    const uniqueName = allocateUniqueDisplayName(trimmed, usedNames);
    if (uniqueName === target.folderName) return;

    const next = current.map((e) =>
      e.id === datasetId ? { ...e, folderName: uniqueName } : e
    );
    setDatasetEntries(next);
  }

  function removeDataset(datasetId) {
    const currentEntries = Array.isArray(datasetEntries) ? datasetEntries : [];
    const target = currentEntries.find((e) => e.id === datasetId);
    if (!target) return;

    // Release ZIP reader/cache if this dataset has one.
    try {
      target?.parsedBundle?.loadedFiles?.imageSource?.dispose?.();
    } catch (err) {
      console.warn('Dispose dataset image source failed:', err);
    }

    const remaining = currentEntries.filter((e) => e.id !== datasetId);
    if (remaining.length === 0) {
      setDatasetEntries([]);
      setActiveDatasetEntryId(null);
      setLoadedFiles(null);
      setColmapData(null);
      closeImageDetail();
      setSelectedImageId(null);
      return;
    }

    const nextActiveId = remaining.some((e) => e.id === activeDatasetEntryId)
      ? activeDatasetEntryId
      : remaining[0].id;
    const normalized = remaining.map((entry) => ({ ...entry, active: entry.id === nextActiveId }));
    setDatasetEntries(normalized);
    setActiveDatasetEntryId(nextActiveId);
    rebuildVisualizationFromEntries(normalized);
  }

  async function processFilesWithSource(files, zipImageSource = null) {
    setLoading(true);

    try {
      setDroppedFiles(files);

      const chosen = pickColmapDirectory(files);

      if (!chosen.camerasFile || !chosen.imagesFile || !chosen.points3DFile) {
        throw new Error(
          'Missing required COLMAP files. Need cameras, images, points3D (.bin or .txt)'
        );
      }

      let folderResolver = null;
      if (zipImageSource) {
        setLoadedFiles({
          camerasFile: chosen.camerasFile,
          imagesFile: chosen.imagesFile,
          points3DFile: chosen.points3DFile,
          databaseFile: chosen.databaseFile,
          rigsFile: chosen.rigsFile,
          framesFile: chosen.framesFile,
          imageSource: zipImageSource,
          canResolveRasterImages: true,
        });
      } else {
        folderResolver = makeFolderImageResolver(files);
        setLoadedFiles({
          camerasFile: chosen.camerasFile,
          imagesFile: chosen.imagesFile,
          points3DFile: chosen.points3DFile,
          databaseFile: chosen.databaseFile,
          rigsFile: chosen.rigsFile,
          framesFile: chosen.framesFile,
          imageResolver: folderResolver,
          canResolveRasterImages: fileMapHasRasterImagePaths(files),
        });
      }

      const [cameras, images, points3D] = await Promise.all([
        chosen.camerasFile.name.endsWith('.bin')
          ? chosen.camerasFile.arrayBuffer().then(parseCamerasBinary)
          : chosen.camerasFile.text().then(parseCamerasText),
        chosen.imagesFile.name.endsWith('.bin')
          ? chosen.imagesFile.arrayBuffer().then((buf) => parseImagesBinary(buf, false))
          : chosen.imagesFile.text().then(parseImagesText),
        chosen.points3DFile.name.endsWith('.bin')
          ? chosen.points3DFile.arrayBuffer().then(parsePoints3DBinary)
          : chosen.points3DFile.text().then(parsePoints3DText),
      ]);

      const statsResult = computeImageStats(images, points3D);
      const {
        pointCloudTotalObservations,
        imageNumPoints3D,
        imageAvgError,
        imageCovisibleCount,
        imagePairCovisibilityCount,
        pointCloudIdsByImage,
      } = statsResult;

      let rigData;
      if (chosen.rigsFile && chosen.framesFile) {
        try {
          const [rigs, frames] = await Promise.all([
            chosen.rigsFile.name.endsWith('.bin')
              ? chosen.rigsFile.arrayBuffer().then(parseRigsBinary)
              : chosen.rigsFile.text().then(parseRigsText),
            chosen.framesFile.name.endsWith('.bin')
              ? chosen.framesFile.arrayBuffer().then(parseFramesBinary)
              : chosen.framesFile.text().then(parseFramesText),
          ]);
          rigData = { rigs, frames };
        } catch (err) {
          console.warn('Parse rig/frame failed:', err);
        }
      }

      const pointCloud = points3D || null;
      const timeMeta = await loadSidecarsAndJoin(chosen, images, pointCloud);
      const pointCloudPointCount = pointCloud?.size ?? 0;
      let pointCloudAverageError = 0;
      if (pointCloud && pointCloud.size > 0) {
        let sum = 0, cnt = 0;
        for (const pt of pointCloud.values()) {
          if (pt.error >= 0) { sum += pt.error; cnt++; }
        }
        pointCloudAverageError = cnt > 0 ? sum / cnt : 0;
      }

      const colmapData = {
        cameras,
        images,
        ...(pointCloud && pointCloud.size > 0 && { pointCloud }),
        ...(timeMeta && { timeMeta }),
        rigData,
        pointCloudPointCount,
        pointCloudTotalObservations,
        pointCloudAverageError,
        imageNumPoints3D,
        imageAvgError,
        imageCovisibleCount,
        imagePairCovisibilityCount,
        pointCloudIdsByImage,
      };

      clearThumbnailCache();
      clearFrustumCache();
      clearDecodeFailures();

      setSelectedImageId(null);
      closeImageDetail();

      await new Promise((r) => setTimeout(r, 200));

      const currentSourceType = sourceTypeRef?.current;
      if (!currentSourceType) setSourceInfo('local', null);

      setColmapData(colmapData);

      const scale = deriveFrustumDisplayScale(images);
      setCameraScale(scale);

      resetView();

      const { missingImages, totalImages, totalFiles } = folderResolver
        ? folderResolver.findMissing(images)
        : { missingImages: [], totalImages: images.size, totalFiles: 0 };
      if (missingImages.length > 0) {
        console.warn(
          `⚠️ ${missingImages.length}/${totalImages} images not found (${totalFiles} in lookup)`
        );
        const n = Math.min(10, missingImages.length);
        console.warn('Missing sample:', missingImages.slice(0, n).map((img) => `ID ${img.imageId}: "${img.name}"`));
        if (missingImages.length > n) console.warn(`… and ${missingImages.length - n} more`);
      }

      const failedCount = getFailedDecodeCount();
      if (failedCount > 0) {
        console.warn(
          `⚠️ ${failedCount} images failed to decode. Re-export or convert with ImageMagick etc.`
        );
      }
    } catch (err) {
      console.error('Load failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function processZipFile(zipFile, options = {}) {
    const noImage = !!options.noImage;
    setLoading(true);
    try {
      const datasetId = makeDatasetId('zip');
      const entries = Array.isArray(datasetEntries) ? datasetEntries : [];
      const keepActiveId =
        activeDatasetEntryId ??
        entries.find((e) => e.active)?.id ??
        entries[0]?.id ??
        null;
      const shouldAppendToSidebar = entries.length > 0 && keepActiveId != null;
      if (shouldAppendToSidebar) {
        appendDatasetsWithUniqueDisplayNames(
          [
            makeDatasetEntry(
              datasetId,
              zipFile.name,
              { directoryPath: 'sparse/0', camerasFile: {}, imagesFile: {}, points3DFile: {} },
              false,
              { type: 'zip', zipFile, noImage },
              false,
              null
            ),
          ],
          keepActiveId
        );
        return;
      }

      const { sparseFiles, imageSource } = await loadColmapFromZip(zipFile, { noImage });
      setSourceInfo('zip', null);
      const parsedBundle = await parseChosenFiles(sparseFiles, pickColmapDirectory(sparseFiles), imageSource);
      const zipEntry = makeDatasetEntry(
        datasetId,
        zipFile.name,
        { directoryPath: 'sparse/0', camerasFile: {}, imagesFile: {}, points3DFile: {} },
        true,
        { type: 'zip', zipFile, noImage },
        true,
        parsedBundle
      );
      setDatasetEntries([zipEntry]);
      setActiveDatasetEntryId(datasetId);
      rebuildVisualizationFromEntries([zipEntry]);
    } catch (err) {
      console.error('[ZIP] Process failed:', err);
      setError(err instanceof Error ? err.message : 'ZIP process failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!e.dataTransfer?.types.includes('Files')) return;

    const items = e.dataTransfer?.items;
    if (!items) return;

    if (e.dataTransfer.files.length === 1) {
      const single = e.dataTransfer.files[0];
      if (isZipFile(single)) {
        try {
          await processZipFile(single);
        } catch (_) {
          // 错误已由 processZipFile 通过 setError 处理
        }
        return;
      }
    }

    const entries = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const ent = item.webkitGetAsEntry();
      if (ent) entries.push(ent);
    }

    const grouped = [];
    for (const ent of entries) {
      const groupMap = new Map();
      await collectFilesFromEntry(ent, '', groupMap);
      grouped.push({ name: ent.name, files: groupMap, chosen: pickColmapDirectory(groupMap) });
    }

    if (grouped.length === 0 && e.dataTransfer.files.length > 0) {
      const fallbackMap = new Map();
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i];
        fallbackMap.set(f.name, f);
      }
      const chosen = pickColmapDirectory(fallbackMap);
      const shouldKeepCurrentVisualization = !!(colmapData && activeDatasetEntryId);
      if (shouldKeepCurrentVisualization) {
        const datasetId = makeDatasetId('drop');
        appendDatasetsWithUniqueDisplayNames(
          [makeDatasetEntry(datasetId, 'Dropped files', chosen, false, { type: 'local', files: fallbackMap, chosen }, false, null)],
          activeDatasetEntryId
        );
        return;
      }

      const datasetId = makeDatasetId('drop');
      const parsedBundle = await parseChosenFiles(fallbackMap, chosen, null);
      const entry = makeDatasetEntry(
        datasetId,
        'Dropped files',
        chosen,
        true,
        { type: 'local', files: fallbackMap, chosen },
        true,
        parsedBundle
      );
      setDatasetEntries([entry]);
      setActiveDatasetEntryId(datasetId);
      rebuildVisualizationFromEntries([entry]);
      return;
    }

    const shouldKeepCurrentVisualization = !!(colmapData && activeDatasetEntryId);
    const batchUsedNames = new Set();
    const datasetList = grouped.map((g, idx) => {
      const id = makeDatasetId(`drop${idx}`);
      const label = shouldKeepCurrentVisualization
        ? g.name
        : allocateUniqueDisplayName(g.name, batchUsedNames);
      return makeDatasetEntry(
        id,
        label,
        g.chosen,
        !shouldKeepCurrentVisualization && idx === 0,
        { type: 'local', files: g.files, chosen: g.chosen },
        false,
        null
      );
    });

    if (shouldKeepCurrentVisualization) {
      appendDatasetsWithUniqueDisplayNames(datasetList, activeDatasetEntryId);
      return;
    }

    if (datasetList.length === 0) return;
    const firstEntry = datasetList[0];
    const parsedBundle = await parseDatasetEntry(firstEntry);
    const withParsed = datasetList.map((entry, idx) =>
      idx === 0
        ? { ...entry, parsedBundle, visualized: true, active: true }
        : entry
    );
    setDatasetEntries(withParsed);
    setActiveDatasetEntryId(firstEntry.id);
    rebuildVisualizationFromEntries(withParsed);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function traverseDirHandle(dirHandle, prefix, acc) {
    for await (const ent of dirHandle.values()) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.kind === 'file') {
        const f = await ent.getFile();
        acc.set(rel, f);
      } else if (ent.kind === 'directory') {
        await traverseDirHandle(ent, rel, acc);
      }
    }
  }

  async function handleBrowse() {
    if (!('showDirectoryPicker' in window)) {
      setError('Folder selection not supported in this browser. Use drag-and-drop or try Chrome/Edge.');
      return;
    }

    try {
      const dirHandle = await window.showDirectoryPicker();
      const acc = new Map();
      await traverseDirHandle(dirHandle, '', acc);
      await processFilesWithSource(acc);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Browse folder failed:', err);
      setError(err instanceof Error ? err.message : 'Open folder failed');
    }
  }

  return {
    handleDrop,
    handleDragOver,
    processFiles: processFilesWithSource,
    processZipFile,
    handleBrowse,
    toggleDatasetVisualization,
    renameDatasetDisplayName,
    removeDataset,
  };
}
