/**
 * Image-plane texture manager: load ImageBitmap from frustums + showImagePlane + selectedImageId;
 * onTextureMapUpdate(map: imageId → { bitmap, hasAlpha }). Uses blob cache for frustum thumbnails.
 */

import { createImageCache } from '../../utils/textureCaching.js';
import {
  FRUSTUM_TEXTURE_MAX_DIM,
  IDLE_CALLBACK_TIMEOUT_MS,
  IDLE_CALLBACK_FALLBACK_MS,
} from '../../config.js';

function canvasToJpegUrl(canvas) {
  const opts = { type: 'image/jpeg', quality: 0.8 };
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob(opts).then((blob) => (blob ? URL.createObjectURL(blob) : null));
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.8);
  }).catch(() => null);
}

const blobUrlCache = createImageCache({
  maxSize: FRUSTUM_TEXTURE_MAX_DIM,
  processCanvas: canvasToJpegUrl,
  dispose: (url) => URL.revokeObjectURL(url),
  idleTimeout: IDLE_CALLBACK_TIMEOUT_MS,
  idleFallback: IDLE_CALLBACK_FALLBACK_MS,
});

/** Blob URL for frustum thumbnail (low-res). */
export function getBlobUrlForFrustumImage(imageFile, imageName) {
  return blobUrlCache.loadImage(imageFile, imageName);
}

/** Clear frustum blob cache (e.g. on new project load). */
export function clearFrustumCache() {
  blobUrlCache.clearCache();
}

function hasAlphaChannel(name) {
  const ext = (name || '').toLowerCase().split('.').pop();
  return ext === 'png' || ext === 'webp';
}

function blobUrlToBitmap(blobUrl) {
  if (!blobUrl) return Promise.resolve(null);
  return fetch(blobUrl)
    .then((r) => r.blob())
    .then((blob) => createImageBitmap(blob))
    .catch(() => null);
}

export class ImageTextureManager {
  /**
   * @param {{ onTextureMapUpdate: (map: Map<number, { bitmap: ImageBitmap, hasAlpha: boolean }>) => void }} options
   */
  constructor(options = {}) {
    this.onTextureMapUpdate = options.onTextureMapUpdate || (() => {});
    /** @type {Map<number, { bitmap: ImageBitmap, hasAlpha: boolean }>} */
    this._map = new Map();
    this._gen = 0;
    this._rafPending = false;
  }

  /** Load textures for visible frustums; call onTextureMapUpdate when done. */
  update(frustums, showImagePlane, selectedImageId) {
    const gen = ++this._gen;
    const visible = [];
    if (frustums?.length) {
      for (const f of frustums) {
        const imageId = f.image?.imageId;
        const isSelected = imageId === selectedImageId;
        if (!(showImagePlane || isSelected) || !f.imageFile || !f.image?.name) continue;
        visible.push({
          imageId,
          imageFile: f.imageFile,
          imageName: f.image.name,
          isSelected,
        });
      }
    }

    const done = () => {
      if (gen !== this._gen) return;
      if (!this._rafPending) {
        this._rafPending = true;
        requestAnimationFrame(() => {
          this._rafPending = false;
          this.onTextureMapUpdate(new Map(this._map));
        });
      }
    };

    const setOne = (imageId, bitmap, hasAlpha) => {
      if (gen !== this._gen) return;
      if (bitmap) {
        this._map.set(imageId, { bitmap, hasAlpha });
      } else {
        this._map.delete(imageId);
      }
      done();
    };

    for (const { imageId, imageFile, imageName, isSelected } of visible) {
      const hasAlpha = hasAlphaChannel(imageName);
      if (isSelected) {
        createImageBitmap(imageFile)
          .then((bitmap) => setOne(imageId, bitmap, hasAlpha))
          .catch(() => {
            getBlobUrlForFrustumImage(imageFile, imageName)
              .then(blobUrlToBitmap)
              .then((bitmap) => setOne(imageId, bitmap, hasAlpha));
          });
      } else {
        getBlobUrlForFrustumImage(imageFile, imageName)
          .then(blobUrlToBitmap)
          .then((bitmap) => setOne(imageId, bitmap, hasAlpha));
      }
    }

    const visibleIds = new Set(visible.map((v) => v.imageId));
    for (const [id] of this._map) {
      if (!visibleIds.has(id)) this._map.delete(id);
    }
    if (visible.length === 0) {
      this._map.clear();
    }
    done();
  }
}
