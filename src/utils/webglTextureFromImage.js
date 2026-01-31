/** Create WebGL texture from ImageBitmap / HTMLImageElement / HTMLCanvasElement. opts.hasAlpha. */
export function createWebGLTextureFromImage(gl, image, opts = {}) {
  if (!image || !image.width || !image.height) return null;
  const hasAlpha = opts.hasAlpha ?? false;
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const fmt = hasAlpha ? gl.RGBA : gl.RGB;
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, fmt, gl.UNSIGNED_BYTE, image);
  } catch (e) {
    gl.deleteTexture(texture);
    return null;
  }
  return texture;
}
