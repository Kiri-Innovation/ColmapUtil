/**
 * 每张图像的统计：3D 点数、平均重投影误差、共视数；图像对共视；图像 → 可见点 ID。
 */

/** 单遍遍历 points3D，计算每图统计与共视。 */
export function buildImageStats(images, pointCloud) {
  const imageIdList = [...images.keys()];
  const perImageAccumulator = new Map();
  const imagePairCount = new Map();
  const imageToPointIds = new Map();

  imageIdList.forEach((id) => {
    perImageAccumulator.set(id, { nPoints: 0, errorSum: 0, errorCount: 0, covisible: new Set() });
    imagePairCount.set(id, new Map());
    imageToPointIds.set(id, new Set());
  });

  let totalObs = 0;

  pointCloud.forEach((point) => {
    const trackImgIds = point.track.map((t) => t.imageId);
    const validError = point.error >= 0;
    totalObs += point.track.length;

    point.track.forEach((elem) => {
      const acc = perImageAccumulator.get(elem.imageId);
      if (acc) {
        acc.nPoints += 1;
        if (validError) {
          acc.errorSum += point.error;
          acc.errorCount += 1;
        }
        trackImgIds.forEach((oid) => { if (oid !== elem.imageId) acc.covisible.add(oid); });
      }
      const ids = imageToPointIds.get(elem.imageId);
      if (ids) ids.add(point.point3DId);
    });

    for (let i = 0; i < trackImgIds.length; i++) {
      for (let j = i + 1; j < trackImgIds.length; j++) {
        const id1 = trackImgIds[i];
        const id2 = trackImgIds[j];
        const m1 = imagePairCount.get(id1);
        const m2 = imagePairCount.get(id2);
        if (m1) m1.set(id2, (m1.get(id2) || 0) + 1);
        if (m2) m2.set(id1, (m2.get(id1) || 0) + 1);
      }
    }
  });

  const numPoints3D = new Map();
  const avgError = new Map();
  const covisibleCount = new Map();
  perImageAccumulator.forEach((acc, id) => {
    numPoints3D.set(id, acc.nPoints);
    avgError.set(id, acc.errorCount > 0 ? acc.errorSum / acc.errorCount : 0);
    covisibleCount.set(id, acc.covisible.size);
  });

  return {
    pointCloudTotalObservations: totalObs,
    imageNumPoints3D: numPoints3D,
    imageAvgError: avgError,
    imageCovisibleCount: covisibleCount,
    imagePairCovisibilityCount: imagePairCount,
    pointCloudIdsByImage: imageToPointIds,
  };
}

export const computeImageStats = buildImageStats;
