/**
 * Image-plane mesh: frustums + textureMap + options → MESH RenderableObject for pipeline.
 */

import { RenderableObject, RenderType } from '@holoengineruntime';
import { createWebGLTextureFromImage } from './webglTextureFromImage.js';

function quadGeometry(gl, halfWidth, halfHeight, far) {
  const positions = [
    -halfWidth, -halfHeight, far,
    halfWidth, -halfHeight, far,
    halfWidth, halfHeight, far,
    -halfWidth, halfHeight, far,
  ];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  const indices = [0, 1, 2, 0, 2, 3];
  const vertexData = new Float32Array(4 * 8);
  for (let i = 0; i < 4; i++) {
    const b = i * 8;
    vertexData[b + 0] = positions[i * 3 + 0];
    vertexData[b + 1] = positions[i * 3 + 1];
    vertexData[b + 2] = positions[i * 3 + 2];
    vertexData[b + 3] = normals[i * 3 + 0];
    vertexData[b + 4] = normals[i * 3 + 1];
    vertexData[b + 5] = normals[i * 3 + 2];
    vertexData[b + 6] = uvs[i * 2 + 0];
    vertexData[b + 7] = uvs[i * 2 + 1];
  }
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
  const elementBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  return {
    vertexBuffer,
    elementBuffer,
    elementCount: 6,
    vertexAttributes: { stride: 32, position: 0, normal: 12, uv: 24 },
  };
}

function modelMatrixFromPose(position, quaternion) {
  const qx = quaternion.x, qy = quaternion.y, qz = quaternion.z, qw = quaternion.w;
  const xx = qx * qx, yy = qy * qy, zz = qz * qz;
  const xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return new Float32Array([
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    position[0], position[1], position[2], 1,
  ]);
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {Array} frustumsData
 * @param {Map<number, { bitmap: ImageBitmap, hasAlpha: boolean }>} textureMap - imageId -> { bitmap, hasAlpha }
 * @param {{ cameraScale: number; selectedImageId: number|null; showImagePlane: boolean }} options
 * @returns {{ imageId: number; obj: RenderableObject; texture: WebGLTexture|null }[]}
 */
export function buildImagePlaneMeshObjects(gl, frustumsData, textureMap, options = {}) {
  const { cameraScale = 1, selectedImageId = null, showImagePlane = false } = options;
  const out = [];
  if (!frustumsData?.length) return out;

  for (const f of frustumsData) {
    const imageId = f.image.imageId;
    const isSelected = imageId === selectedImageId;
    const shouldShow = showImagePlane || isSelected;
    if (!shouldShow) continue;

    const camera = f.camera;
    const position = f.position;
    const quaternion = f.quaternion;
    const aspectRatio = camera.width / camera.height;
    const focalLength = camera.params[0] || 1;
    const far = cameraScale * 1.0;
    const fov = 2 * Math.atan(camera.height / (2 * focalLength));
    const tanHalfFov = Math.tan(fov / 2);
    const halfHeight = far * tanHalfFov;
    const halfWidth = halfHeight * aspectRatio;

    const { vertexBuffer, elementBuffer, elementCount, vertexAttributes } = quadGeometry(gl, halfWidth, halfHeight, far);
    const modelMatrix = modelMatrixFromPose(position, quaternion);

    let texture = null;
    const entry = textureMap?.get(imageId);
    if (entry?.bitmap) texture = createWebGLTextureFromImage(gl, entry.bitmap, { hasAlpha: entry.hasAlpha ?? false });

    const obj = new RenderableObject(`image-plane-${imageId}`, RenderType.MESH);
    obj.vertexBuffer = vertexBuffer;
    obj.elementBuffer = elementBuffer;
    obj.elementCount = elementCount;
    obj.vertexAttributes = vertexAttributes;
    obj.modelMatrix = modelMatrix;
    if (texture) obj.diffuseTexture = texture;
    obj.ready = true;
    out.push({ imageId, obj, texture });
  }
  return out;
}
