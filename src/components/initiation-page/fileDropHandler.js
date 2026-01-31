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
 * Returns drop/browse handlers (handleDrop, handleDragOver, processFiles, processZipFile, handleBrowse) from AppContext.
 */
export function handleFileDrop(context) {
  const {
    setColmapData,
    setLoadedFiles,
    setDroppedFiles,
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
      camerasFile: chosen.cameras,
      imagesFile: chosen.images,
      points3DFile: chosen.points3D,
      databaseFile: chosen.database,
      rigsFile: chosen.rigs,
      framesFile: chosen.frames,
    };
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

  async function processZipFile(zipFile) {
    setLoading(true);
    try {
      const { sparseFiles, imageSource } = await loadColmapFromZip(zipFile);
      setSourceInfo('zip', null);
      await processFilesWithSource(sparseFiles, imageSource);
    } catch (err) {
      console.error('[ZIP] Process failed:', err);
      setError(err instanceof Error ? err.message : 'ZIP process failed');
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
        await processZipFile(single);
        return;
      }
    }

    const fileMap = new Map();
    const entries = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const ent = item.webkitGetAsEntry();
      if (ent) entries.push(ent);
    }

    for (const ent of entries) {
      await collectFilesFromEntry(ent, '', fileMap);
    }

    if (fileMap.size === 0 && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i];
        fileMap.set(f.name, f);
      }
    }

    await processFilesWithSource(fileMap);
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
  };
}
