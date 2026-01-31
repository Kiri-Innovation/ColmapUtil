/**
 * Texture/thumbnail cache: lazy load, decode concurrency, addInvalidateListener for invalidation.
 */

import {
  IMAGE_LOAD_CONCURRENCY,
} from '../config.js';

const DECODE_TIMEOUT_MS = 4000;
const LOG_FAILURE_CAP = 15;
const LOG_SUPPRESS_AT = 16;

const failedKeys = new Set();

export function clearDecodeFailures() {
  failedKeys.clear();
}

export function getFailedDecodeCount() {
  return failedKeys.size;
}

function decodeWithDeadline(file, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Decode timeout ${timeoutMs}ms`));
      }
    }, timeoutMs);
    createImageBitmap(file)
      .then((b) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(b);
        } else b.close();
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

function processBitmapToResult(bitmap, key, maxSize, processCanvas) {
  const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const result = processCanvas(canvas);
  return result instanceof Promise ? result : Promise.resolve(result);
}

/**
 * Create image cache instance.
 * @param {{ maxSize: number; processCanvas: (canvas) => any; dispose: (v: any) => void }} config
 */
export function createImageCache(config) {
  const { maxSize, processCanvas, dispose } = config;
  const cache = new Map();
  const pendingByKey = new Map();
  const invalidateListeners = new Set();
  let version = 0;
  let concurrency = 0;
  let suspended = false;
  const fetchQueue = [];

  function pumpQueue() {
    if (suspended || concurrency >= IMAGE_LOAD_CONCURRENCY || fetchQueue.length === 0) return;
    const job = fetchQueue.shift();
    if (job) {
      concurrency++;
      job();
    }
  }

  async function loadOne(file, key, ver) {
    const cleanup = () => {
      if (ver === version) {
        concurrency--;
        pendingByKey.delete(key);
        pumpQueue();
      }
    };
    try {
      if (failedKeys.has(key)) {
        cleanup();
        return null;
      }
      if (ver !== version) return null;
      const hit = cache.get(key);
      if (hit != null) {
        cleanup();
        return hit;
      }
      let bitmap;
      try {
        bitmap = await decodeWithDeadline(file, DECODE_TIMEOUT_MS);
      } catch (err) {
        failedKeys.add(key);
        if (failedKeys.size <= LOG_FAILURE_CAP) {
          console.warn(`[decode] "${key}" (${(file.size / 1024).toFixed(0)} KB)`, err);
        } else if (failedKeys.size === LOG_SUPPRESS_AT) {
          console.warn(`[decode] Suppressing further failures (${failedKeys.size} total)`);
        }
        cleanup();
        return null;
      }
      if (ver !== version) {
        bitmap.close();
        return null;
      }
      const result = await processBitmapToResult(bitmap, key, maxSize, processCanvas);
      if (ver !== version) {
        if (result != null && typeof dispose === 'function') dispose(result);
        return null;
      }
      if (result != null) cache.set(key, result);
      cleanup();
      return result;
    } catch (err) {
      console.warn(`[cache] "${key}":`, err);
      cleanup();
      return null;
    }
  }

  function queueLoad(file, key) {
    const ver = version;
    const p = new Promise((resolve) => {
      const run = () => {
        if (ver !== version) return resolve(null);
        loadOne(file, key, ver).then(resolve);
      };
      fetchQueue.push(run);
      pumpQueue();
    });
    pendingByKey.set(key, p);
    return p;
  }

  return {
    get(key) {
      return cache.get(key) ?? null;
    },

    loadImage(file, key) {
      const hit = cache.get(key);
      if (hit != null) return Promise.resolve(hit);
      const pending = pendingByKey.get(key);
      if (pending) return pending;
      return queueLoad(file, key);
    },

    addInvalidateListener(callback) {
      invalidateListeners.add(callback);
      return () => invalidateListeners.delete(callback);
    },

    clearCache() {
      version++;
      for (const v of cache.values()) dispose(v);
      cache.clear();
      pendingByKey.clear();
      fetchQueue.length = 0;
      concurrency = 0;
      failedKeys.clear();
      invalidateListeners.forEach((cb) => cb());
    },

    pause() {
      suspended = true;
    },

    resume() {
      if (!suspended) return;
      suspended = false;
      pumpQueue();
    },
  };
}
