/**
 * Canvas render target: clear + viewport only (size from useCanvasSize).
 */

import { CanvasRenderTarget } from '@holoengineruntime';

export class ColmapCanvasRenderTarget extends CanvasRenderTarget {
  beginFrame() {
    if (!this.canvas || !this.gl) return false;
    const gl = this.gl;
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;
    if (w <= 0 || h <= 0) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.currentView.viewport = { x: 0, y: 0, width: w, height: h };
    return true;
  }
}
