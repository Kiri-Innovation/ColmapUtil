/**
 * Archive builder: add COLMAP files and images step by step, then pack into a ZIP Blob and optionally trigger download.
 * Does not expose a "build files map then zipSync" API directly.
 */

import * as encodeBinary from '../encode/binary.js';
import * as encodeText from '../encode/text.js';

const SPARSE_DIR = 'sparse/0';

function normalizeImagePath(relativePath) {
  const p = String(relativePath ?? '').trim().replace(/\\/g, '/');
  if (!p) return null;
  return p.startsWith('images/') ? p : `images/${p}`;
}

function dedupeByFile(pathToFile) {
  const seen = new WeakSet();
  const out = [];
  for (const [path, file] of pathToFile) {
    if (!file || !String(path ?? '').trim()) continue;
    if (seen.has(file)) continue;
    seen.add(file);
    out.push([path, file]);
  }
  return out;
}

/**
 * Create an archive builder.
 * Usage: addSparseFile(name, textFn, binaryFn) for cameras/images/points3D/rigs/frames;
 * addImages(pathToFileMap) for images; setCompression(n); build() returns Blob; download(blob, filename) triggers browser download.
 */
export function createArchiveBuilder() {
  const sparseEntries = [];
  const imageEntries = [];
  let compressionLevel = 6;
  let useBinary = false;

  return {
    setFormatBinary(binary) {
      useBinary = !!binary;
    },
    setCompressionLevel(n) {
      compressionLevel = n ?? 6;
    },
    addSparseFile(name, getText, getBinary) {
      sparseEntries.push({ name, getText, getBinary });
    },
    addImages(pathToFileMap) {
      if (pathToFileMap && pathToFileMap.size) {
        imageEntries.push(...dedupeByFile(pathToFileMap));
      }
    },
    async build(options = {}) {
      const { zipSync } = await import('fflate');
      const binary = options.format === 'binary';
      const ext = binary ? 'bin' : 'txt';
      const encoder = binary ? null : new TextEncoder();
      const archive = {};

      for (const { name, getText, getBinary } of sparseEntries) {
        const key = `${SPARSE_DIR}/${name}.${ext}`;
        const text = getText();
        const bin = getBinary();
        archive[key] = binary ? new Uint8Array(bin) : encoder.encode(text);
      }

      if (options.includeImages && imageEntries.length) {
        for (const [path, file] of imageEntries) {
          const archivePath = normalizeImagePath(path);
          if (!archivePath) continue;
          try {
            archive[archivePath] = new Uint8Array(await file.arrayBuffer());
          } catch (e) {
            console.warn('[Export] Image write failed:', path, e);
          }
        }
      }

      const zipBytes = zipSync(archive, { level: compressionLevel });
      return new Blob([zipBytes], { type: 'application/zip' });
    },
  };
}

/**
 * Populate the builder from colmapData and options, then return the Blob.
 */
export async function buildColmapArchive(colmapData, options, imageFiles, _progress) {
  const builder = createArchiveBuilder();
  builder.setFormatBinary(options.format === 'binary');
  builder.setCompressionLevel(options.compressionLevel ?? 6);

  const pointMap = colmapData?.pointCloud?.size ? colmapData.pointCloud : new Map();
  const rigInfo = colmapData?.rigData;

  builder.addSparseFile(
    'cameras',
    () => encodeText.encodeCamerasToText(colmapData.cameras),
    () => encodeBinary.encodeCamerasToBuffer(colmapData.cameras)
  );
  builder.addSparseFile(
    'images',
    () => encodeText.encodeImagesToText(colmapData.images),
    () => encodeBinary.encodeImagesToBuffer(colmapData.images)
  );
  builder.addSparseFile(
    'points3D',
    () => encodeText.encodePoints3DToText(pointMap),
    () => encodeBinary.encodePoints3DToBuffer(pointMap)
  );
  if (rigInfo?.rigs?.size) {
    builder.addSparseFile(
      'rigs',
      () => encodeText.encodeRigsToText(rigInfo.rigs),
      () => encodeBinary.encodeRigsToBuffer(rigInfo.rigs)
    );
  }
  if (rigInfo?.frames?.size) {
    builder.addSparseFile(
      'frames',
      () => encodeText.encodeFramesToText(rigInfo.frames),
      () => encodeBinary.encodeFramesToBuffer(rigInfo.frames)
    );
  }
  if (options.includeImages && imageFiles?.size) {
    builder.addImages(imageFiles);
  }

  return builder.build(options);
}

function triggerDownload(blob, suggestedName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function saveColmapAsZip(colmapData, options, imageFiles, _unused, filename = 'colmap-export.zip') {
  const blob = await buildColmapArchive(colmapData, options, imageFiles);
  triggerDownload(blob, filename);
}
