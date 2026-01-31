/**
 * 缩略图：缓存逻辑 + Thumbnail 函数组件，供画廊使用。
 */

import { useState, useEffect } from 'react';
import { createImageCache } from '../../utils/textureCaching.js';

const THUMBNAIL_SIZE = 256;

async function canvasToBlobUrl(canvas) {
  return new Promise((resolve) => {
    if (canvas instanceof OffscreenCanvas) {
      canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 }).then((blob) => {
        resolve(blob ? URL.createObjectURL(blob) : null);
      }).catch(() => resolve(null));
    } else {
      canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.75);
    }
  });
}

const thumbnailCache = createImageCache({
  maxSize: THUMBNAIL_SIZE,
  processCanvas: canvasToBlobUrl,
  dispose: (url) => URL.revokeObjectURL(url),
  idleTimeout: 500,
  idleFallback: 16,
});

export function clearThumbnailCache() {
  thumbnailCache.clearCache();
}

export function pauseThumbnailCache() {
  thumbnailCache.pause();
}

export function resumeThumbnailCache() {
  thumbnailCache.resume();
}

/**
 * 缩略图函数组件：根据 imageFile/imageName/enabled 加载缩略图 URL，通过 render prop 渲染。
 * @param {{ imageFile?: File | null; imageName: string; enabled: boolean; children: (url: string | null) => React.ReactNode }} props
 */
export function Thumbnail({ imageFile, imageName, enabled, children }) {
  const [url, setUrl] = useState(() => {
    if (!enabled || !imageName) return null;
    if (!imageFile) return thumbnailCache.get(imageName) ?? null;
    return null;
  });

  useEffect(() => {
    if (!enabled || !imageName) {
      setUrl(null);
      return;
    }
    if (!imageFile) {
      setUrl(thumbnailCache.get(imageName) ?? null);
      return;
    }
    thumbnailCache.loadImage(imageFile, imageName).then((u) => setUrl(u ?? null));
  }, [imageFile, imageName, enabled]);

  useEffect(() => {
    const unsub = thumbnailCache.addInvalidateListener(() => setUrl(null));
    return unsub;
  }, []);

  return typeof children === 'function' ? children(url) : null;
}
