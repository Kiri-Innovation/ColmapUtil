/**
 * Resolve relative path to full requestable URL using Vite base config.
 * Used for public assets when deployed under a subpath (e.g. /app/, /v1.0/).
 */
export function resolveBaseUrl(relativePath) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  const seg = String(relativePath).replace(/^\//, '');
  return seg ? `${base}/${seg}` : base || '/';
}

/** Legacy alias */
export const getPublicAssetUrl = resolveBaseUrl;
