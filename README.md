# ColmapUtil

基于 React 的 COLMAP 重建数据可视化工具，使用 HoloRP（开源 WebGL 原生实现，自带点云渲染），支持拖放文件夹或 ZIP 加载，适合本地使用与嵌入。

**格式与兼容性**：解析与导出仅遵循 [COLMAP](https://colmap.github.io/) 官方公开的文件格式与目录约定（bin/txt、sparse/0 等）。

## 功能特性

- ✅ **COLMAP 文件解析**
  - 支持二进制格式 (.bin) 和文本格式 (.txt)
  - 解析 cameras、images、points3D 文件
  
- ✅ **文件加载**
  - 拖放文件夹或 ZIP 文件
  - 自动检测子目录中的 COLMAP 文件
  - 支持从 ZIP 压缩包中提取文件

- ✅ **3D 可视化**
  - 点云渲染（使用 RGB 颜色）
  - 相机视锥体可视化
  - 交互式 3D 场景（旋转、缩放、平移）

- ✅ **状态管理**
  - 使用 React Context 与 useState 管理应用状态
  - 加载进度显示
  - 错误处理

## 技术栈

- **React 19** - UI 框架
- **HoloRP** - 开源 WebGL 原生实现，自带点云渲染（便于嵌入与定制）
- **React Context + useState** - 应用状态
- **@zip.js/zip.js** - ZIP 解压与图像懒加载
- **fflate** - 导出时打包 ZIP
- **Vite** - 构建

解析与导出按职责放在 `codec/parse`、`codec/stats`、`codec/export` 子目录；文档与界面以中文为主（计划支持中英双语）。

## 安装

```bash
npm install
```

## 开发

```bash
npm run dev
```

## 构建

```bash
npm run build
```

## 使用方法

1. 启动开发服务器后，在浏览器中打开应用
2. 拖放包含 COLMAP 文件的文件夹或 ZIP 文件
   - 必需文件：`cameras.bin/txt`, `images.bin/txt`, `points3D.bin/txt`
   - 支持自动检测子目录（如 `sparse/0/`）
3. 在 3D 场景中查看重建结果：
   - **左键拖拽** - 旋转视角
   - **右键拖拽** - 平移
   - **滚轮** - 缩放
   - **点击空白区域** - 取消选择当前选中的相机
   - **点击相机** - 选择相机并聚焦

## 交互设计

### 相机控制

应用使用 HoloRP 运行时的相机控制 Hook，支持两种模式：

- **Fly 模式（FPS）**：第一人称视角，鼠标拖拽旋转视角，WASD 移动相机
- **Orbit 模式**：轨道相机，相机围绕目标点旋转

### 拖拽检测

相机控制 Hook 提供了拖拽检测 API，允许应用区分"点击"和"拖拽"操作：

- **拖拽**：鼠标按下并移动超过 5 像素 → 用于旋转视角
- **点击**：鼠标按下但未移动或移动很小 → 用于选择对象、取消选择等

这确保了：
- 拖拽旋转视角时不会误触发点击操作（如取消选择相机）
- 点击空白区域时可以正确取消选择相机
- 点击相机时可以正确选择相机

详细 API 见 [HoloRP 运行时 README](./src/HoloEngineRuntime/README.md#usefpscameracontrol--useorbitcameracontrol)。

## 项目结构

```
src/
├── components/            # React 组件
│   ├── initiation-page/   # 启动页（文件拖放/浏览）
│   ├── sidebar/           # 侧栏（图像列表、详情）
│   ├── visualizer/        # 3D 可视化（ColmapVisualizer、OverlayUI、纹理管理等）
│   └── common/            # 通用组件（表单、工具提示、Toast、设置弹窗等）
├── codec/                 # COLMAP 编解码（格式注册表 + 实体处理器）
│   ├── colmap_enums.js    # 类型与常量
│   ├── io/
│   │   └── stream.js      # 底层二进制游标与分块写入
│   ├── formats/           # 各实体格式处理器（fromBinary/fromText/toBinary/toText）
│   │   ├── shared.js      # 公共工具（lineToTokens、numberToColmapText、sortedEntriesById）
│   │   ├── cameras.js, images.js, points3d.js, rigs.js, frames.js
│   │   └── registry.js    # 按实体名分发的解析/序列化
│   ├── parse/
│   │   └── colmapDataCodec.js   # 解析公共 API
│   ├── stats/
│   │   └── colmapStatsCalc.js
│   └── export/
│       └── exportingUtils.js    # 导出公共 API 与 ZIP 打包
├── AppContext.jsx          # 应用状态（与 App 同级）
├── utils/                  # 工具函数
│   ├── colmapTransforms.js   # 位姿 → 相机世界坐标
│   ├── sim3dTransforms.js    # Sim3 相似变换与场景预设
│   ├── imageFileUtils.js     # 图像路径解析、mask 查找
│   ├── zipLoader.js          # ZIP 加载与懒加载图像源
│   └── ...                 # 其他工具
├── HoloEngineRuntime/     # HoloRP 运行时（子模块）
└── styles/                # 样式与设计系统
```

## 后续计划

- 图像画廊
- 相机选择与高亮
- 点云过滤与颜色模式
- 导出功能
- URL 分享

## 许可证

与主项目保持一致



