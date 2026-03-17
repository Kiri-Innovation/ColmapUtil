/**
 * i18n: locale state + EN/CN translations. Default language: English.
 * Use useLocale() and useT() from AppContext (locale is provided there).
 */

const LOCALE_STORAGE_KEY = 'colmap-util-locale';
const DEFAULT_LOCALE = 'en';

export const LOCALES = { EN: 'en', CN: 'zh' };

/** @type {Record<string, { en: string; zh: string }>} */
export const T = {
  // App header / toolbar
  toolbarImages: { en: 'Images', zh: '图像' },
  toolbarCameras: { en: 'Cameras', zh: '相机' },
  loading: { en: 'Loading…', zh: '加载中...' },
  receivingAndLoading: { en: 'Receiving files and loading…', zh: '正在收取文件和加载…' },

  // App footer / statusbar
  points: { en: 'Points', zh: '点' },
  images: { en: 'Images', zh: '图像' },
  cameras: { en: 'Cameras', zh: '相机' },
  observations: { en: 'Observations', zh: '观测' },
  dropHint: { en: 'Drag & drop COLMAP folder to load', zh: '拖放 COLMAP 文件夹以加载' },
  observationsInfo: {
    en: 'Observations = total 2D observations (sum of track lengths). E.g. one point seen by 5 images + one by 3 = 8 observations. Distinct from "points" (3D point count).',
    zh: '观测 = 2D 观测总数（轨迹长度之和）。例如一个点被 5 张图看到 + 一个被 3 张 = 8 观测。与「点」（3D 点数）不同。',
  },

  // Sidebar
  back: { en: '← Back', zh: '← 返回' },
  imageGallery: { en: 'Image Gallery', zh: '图像画廊' },

  // Initiation page
  importTitle: { en: 'Import COLMAP Data', zh: '导入 COLMAP 数据' },
  importDesc: {
    en: 'Drop a folder or ZIP with cameras / images / points3D here, or click the plus to browse.',
    zh: '将包含 cameras / images / points3D 的目录或 ZIP 放到此处，或点击上方加号选择文件',
  },
  viewInstructions: { en: 'View instructions', zh: '查看说明' },
  close: { en: 'Close', zh: '关闭' },
  supportedFormats: { en: 'Supported formats & structure', zh: '支持的格式与结构' },
  dragReleaseTitle: { en: 'Release to import', zh: '松开即可导入' },
  dragReleaseSub: { en: 'Must include cameras, images, points3D (.bin or .txt)', zh: '需包含 cameras、images、points3D（.bin 或 .txt）' },
  loadInfoTitle: { en: 'Import instructions', zh: '导入说明' },
  requiredFiles: { en: 'Required files', zh: '所需文件' },
  requiredFilesList1: {
    en: 'One each of cameras, images, points3D; .bin or .txt',
    zh: 'cameras、images、points3D 各一份，扩展名为 .bin 或 .txt 均可',
  },
  requiredFilesList2: {
    en: 'Can be in subfolders; tool will look for sparse/0, sparse, etc.',
    zh: '可放在任意子目录下，本工具会自动查找 sparse/0、sparse 等常见路径',
  },
  optional: { en: 'Optional', zh: '可选' },
  optionalList1: { en: 'Source images: jpg / png / webp / tiff', zh: '源图：jpg / png / webp / tiff' },
  optionalList2: { en: 'Masks in masks/', zh: 'masks/ 下的遮罩图' },
  zipTitle: { en: 'ZIP', zh: 'ZIP' },
  zipList1: {
    en: 'ZIP supported (recommend < 2GB); folders inside are scanned automatically',
    zh: '支持打包成 ZIP（建议 < 2GB），内部目录会自动扫描',
  },
  zipList2: { en: 'Images are read on demand, not loaded into memory at once', zh: '图像按需读取，不一次性载入内存' },
  importTip: {
    en: 'Drop a reconstruction folder or ZIP onto the page; no need to unzip or organize paths first.',
    zh: '把重建目录或 ZIP 拖入页面即可，无需事先解压或整理路径。',
  },

  // Settings modal
  settings: { en: 'Settings', zh: '设置' },
  language: { en: 'Language', zh: '语言' },
  cursorExtension: { en: 'Cursor / VSCode Extension', zh: 'Cursor / VSCode 插件' },
  clearPreferences: { en: 'Clear preferences', zh: '清除偏好设置' },

  // Extension modal
  extensionModalTitle: { en: 'Send to ColmapUtil — Cursor / VSCode Extension', zh: 'Send to ColmapUtil — Cursor / VSCode 插件' },
  extensionDownload: { en: 'Download Extension (.vsix)', zh: '下载插件 (.vsix)' },
  extensionFeaturesTitle: { en: 'Features', zh: '功能介绍' },
  extensionFeaturesDesc: {
    en: 'This extension lets you send a COLMAP project folder directly to ColmapUtil from Cursor or VSCode.',
    zh: '该插件支持在 Cursor 或 VSCode 中，将 COLMAP 项目文件夹直接发送到 ColmapUtil 网页。',
  },
  extensionFeature1: {
    en: 'Right-click a folder in Explorer → "Send to ColmapUtil"',
    zh: '在资源管理器中右键文件夹 → 选择「Send to ColmapUtil」',
  },
  extensionFeature2: {
    en: 'Automatically packs the folder into a ZIP and sends it to the web app',
    zh: '自动将文件夹打包为 ZIP 并发送到网页工具',
  },
  extensionFeature3: {
    en: 'Supports SSH Remote and other remote workspaces',
    zh: '支持 SSH Remote 等远程工作区',
  },
  extensionInstallTitle: { en: 'Installation', zh: '安装方式' },
  extensionInstallStep1: {
    en: 'Download the .vsix file using the button above',
    zh: '点击上方按钮下载 .vsix 文件',
  },
  extensionInstallStep2: {
    en: 'In Cursor/VSCode: open Command Palette (Cmd/Ctrl+Shift+P) → "Extensions: Install from VSIX..."',
    zh: '在 Cursor/VSCode 中：打开命令面板 (Cmd/Ctrl+Shift+P) → 输入「Extensions: Install from VSIX...」',
  },
  extensionInstallStep3: {
    en: 'Select the downloaded colmaputil-send.vsix file to install',
    zh: '选择下载的 colmaputil-send.vsix 文件完成安装',
  },
  extensionUsageTitle: { en: 'Usage', zh: '使用方式' },
  extensionUsageStep1: {
    en: 'Open a workspace containing a COLMAP reconstruction folder (with cameras, images, points3D)',
    zh: '打开包含 COLMAP 重建文件夹的工作区（需有 cameras、images、points3D）',
  },
  extensionUsageStep2: {
    en: 'In the Explorer sidebar, right-click the folder you want to send',
    zh: '在左侧资源管理器中，右键要发送的文件夹',
  },
  extensionUsageStep3: {
    en: 'Select "Send to ColmapUtil" — the folder will be packed and opened in ColmapUtil',
    zh: '选择「Send to ColmapUtil」— 文件夹将被打包并在 ColmapUtil 中打开',
  },
  resetting: { en: 'Resetting…', zh: '正在重置...' },
  clearPreferencesConfirm: {
    en: 'Clear all preferences? This will reset all local settings (e.g. camera scale, point size) to defaults.',
    zh: '确定要清除所有偏好设置吗？这将重置所有本地存储的设置（如相机尺寸、点云大小等）到默认值。',
  },
  clearPreferencesError: {
    en: 'Failed to clear preferences. Please refresh and try again.',
    zh: '清除偏好设置时出错，请刷新页面重试。',
  },

  // OverlayUI / Layers
  worldGrid: { en: 'World Grid', zh: 'World Grid' },
  axis: { en: 'Axis', zh: 'Axis' },
  background: { en: 'Background', zh: 'Background' },
  pointCloud: { en: 'Point Cloud', zh: 'Point Cloud' },
  pointSize: { en: 'Point size', zh: '点大小' },
  colorMode: { en: 'Color mode', zh: '颜色模式' },
  errorModeDesc: {
    en: 'Error = reprojection error (pixels). Lower (green) = more reliable.',
    zh: '误差是指重投影误差（Reprojection Error），单位为像素。误差越小（绿色）表示点越准确可靠。',
  },
  trackLengthDesc: {
    en: 'Track length = how many images see each 3D point. Longer = usually more reliable.',
    zh: '轨迹长度是指每个3D点被多少个图像观测到。轨迹长度越长，表示该点被更多视角观测，通常更可靠。',
  },
  errorLabel: { en: 'Error', zh: '误差' },
  trackLengthLabel: { en: 'Track length', zh: '轨迹长度' },
  cameraScale: { en: 'Camera scale', zh: '相机缩放' },
  frustumColorSingle: { en: 'Single', zh: '单一' },
  frustumColorByCamera: { en: 'By camera', zh: '按相机' },
  frustumColorByRig: { en: 'By frame', zh: '按帧' },
  transformTool: { en: 'Transform (T)', zh: '变换工具 (T)' },
  transformOff: { en: 'Off', zh: '关闭' },
  transformGlobal: { en: 'Global', zh: '全局' },
  transformLocal: { en: 'Local', zh: '局部' },
  scale: { en: 'Scale', zh: '缩放' },
  rotateX: { en: 'Rotate X', zh: '旋转 X' },
  rotateY: { en: 'Rotate Y', zh: '旋转 Y' },
  rotateZ: { en: 'Rotate Z', zh: '旋转 Z' },
  translateX: { en: 'Translate X', zh: '平移 X' },
  translateY: { en: 'Translate Y', zh: '平移 Y' },
  translateZ: { en: 'Translate Z', zh: '平移 Z' },
  reset: { en: 'Reset', zh: '重置' },
  applyTransform: { en: 'Apply transform', zh: '应用变换' },
  rebuildFormat: { en: 'Reconstruction format', zh: '重建数据格式' },
  binaryFormat: { en: 'Binary (.bin)', zh: '二进制 (.bin)' },
  textFormat: { en: 'Text (.txt)', zh: '文本 (.txt)' },
  exportZip: { en: 'Export as ZIP', zh: '导出压缩包 (.zip)' },
  cameraMode: { en: 'Camera mode', zh: '相机模式' },
  projection: { en: 'Projection', zh: '投影' },
  cameraSpeedScale: { en: 'Move speed', zh: '移动速度' },
  quickMove: { en: 'Quick move', zh: '快捷移动' },
  resetView: { en: 'Reset view (R)', zh: '重置视图 (R)' },
  desktopOnly: { en: 'Desktop Only', zh: 'Desktop Only' },
  desktopOnlyDesc: {
    en: 'Drag and drop a COLMAP folder is difficult on mobile devices.',
    zh: '在移动设备上拖放 COLMAP 文件夹较为困难。',
  },

  // Image detail panel
  imageId: { en: 'Image ID', zh: '图像 ID' },
  imageName: { en: 'Image name', zh: '图像名称' },
  cameraModel: { en: 'Camera model', zh: '相机模型' },
  resolution: { en: 'Resolution', zh: '分辨率' },
  intrinsics: { en: 'Intrinsics', zh: '内参' },
  rotationR: { en: 'Rotation R (qw,qx,qy,qz)', zh: '旋转 R (qw,qx,qy,qz)' },
  translationT: { en: 'Translation T', zh: '平移 T' },
  cameraDetail: { en: 'Camera detail', zh: '相机详情' },
  points2D: { en: '2D points', zh: '2D 点' },
  points3D: { en: '3D points', zh: '3D 点' },
  pointMatches: { en: 'Point matches', zh: '点匹配' },
  selectImage: { en: 'Select image', zh: '请选择图片' },
  selectRelatedImage: { en: 'Select related image…', zh: '选择关联图像...' },
  matches: { en: 'matches', zh: '匹配' },
  scrollWheelSwitchImage: { en: 'Scroll wheel to switch image', zh: '滚轮切换图片' },
  prevImage: { en: '← Previous', zh: '← 上一张' },
  nextImage: { en: 'Next →', zh: '下一张 →' },
  noImageLoaded: { en: 'No image loaded', zh: '未加载图像' },
  maskModeHover: { en: 'hover', zh: 'hover' },
  maskModeMask: { en: 'mask', zh: 'mask' },
  maskModeSplit: { en: 'split', zh: 'split' },
  maskModeImage: { en: 'image', zh: 'image' },
  clickLabel: { en: 'Click:', zh: 'Click:' },

  // Image gallery
  loadColmapToViewImages: { en: 'Load COLMAP data to view images', zh: '加载 COLMAP 数据以查看图像' },
  noImagesFound: { en: 'No images found', zh: '未找到图像' },
  allCameras: { en: 'All cameras', zh: '所有相机' },
  cameraLabel: { en: 'Camera', zh: '相机' },
  sortLabel: { en: 'Sort:', zh: '排序:' },
  sortByName: { en: 'Sort: Name', zh: '排序: 名称' },
  sortByImageId: { en: 'Sort: Image ID', zh: '排序: 图像 ID' },
  sortByAvgError: { en: 'Sort: Avg error', zh: '排序: 平均误差' },
  sortByCovisible: { en: 'Sort: Covisible', zh: '排序: 共视' },
  sortBy3DPoints: { en: 'Sort: 3D points', zh: '排序: 3D 点' },
  sortBy2DPoints: { en: 'Sort: 2D points', zh: '排序: 2D 点' },
  ascending: { en: 'Ascending', zh: '升序' },
  descending: { en: 'Descending', zh: '降序' },
  gridViewTitle: { en: 'Grid view (Shift+scroll to resize)', zh: '网格视图 (Shift+滚动调整大小)' },
  listViewTitle: { en: 'List view (with stats)', zh: '列表视图（带统计信息）' },
  hover3DPoints: { en: '3D points', zh: '3D points' },
  hover2DPoints: { en: '2D points', zh: '2D points' },
  hoverCovisible: { en: 'covisible', zh: 'covisible' },
  hoverAvgError: { en: 'avg error', zh: 'avg error' },
  hoverLeftDetails: { en: 'Left: details', zh: 'Left: details' },
  hoverLeftSelect: { en: 'Left: select', zh: 'Left: select' },
  hoverRightMatches: { en: 'Right: matches', zh: 'Right: matches' },
  hoverRightBack: { en: 'Right: back', zh: 'Right: back' },
  hoverRightFlyTo: { en: 'Right: fly to', zh: 'Right: fly to' },
};

export function getStoredLocale() {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (v === 'zh' || v === 'en') return v;
  } catch (_) {}
  return DEFAULT_LOCALE;
}

export function setStoredLocale(locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch (_) {}
}

/**
 * @param {string} key - key in T
 * @param {'en'|'zh'} locale
 * @returns {string}
 */
export function translate(key, locale) {
  const entry = T[key];
  if (!entry) return key;
  return entry[locale] ?? entry.en ?? key;
}
