# HarmonyOS SVG 清晰度、样式和文字偏移问题处理报告

## 1. 文档目的

本文记录 `uni-ai-x` 在 HarmonyOS 端使用 `image` 组件显示 MathJax 和 Mermaid SVG 时遇到的问题、应用层规避方案及验证结果，供 uni-app x / HarmonyOS 图片解码链路相关工程师定位并在框架层修复。

当前方案已经在本项目的 HarmonyOS 模拟器及 API 24 真机上人工验证：

- 数学公式清晰且位置正常；
- Mermaid 方框、连线、箭头、颜色和文字均正常；
- Mermaid 节点文字不再偏移。

应用层规避实现已抽离为两个独立模块：

- `uni_modules/uni-ai-x/sdk/harmony-svg-workaround.uts`：平台开关、DPR、系统 API 分流和文件缓存；无 `<text>` 的 SVG 可按版本使用文件缓存，含 `<text>` 的 SVG 保持 data URL 交给框架预处理；
- `uni_modules/uni-ai-x/static/proxy-web/harmony-svg-workaround.js`：HarmonyOS 解码缩放和节点基线语义标准化、HarmonyOS/iOS 共用的完整样式内联与箭头 marker 实体化，以及独立的 iOS CoreSVG 结构兼容处理。

原有流程仅保留调用点：

- `uni_modules/uni-ai-x/sdk/themed-svg.uts`
- `uni_modules/uni-ai-x/static/proxy-web/proxy-web.html`

抽离后的依赖方向为：

```text
themed-svg.uts
  -> getHarmonySvgWorkaroundConfig()
  -> prepareHarmonySvgImageSource()

proxy-web.html
  -> harmonySvgWorkaround.applyDecodeScale()
  -> harmonySvgWorkaround.prepareForDecode()
```

兼容规则、平台条件、DPR 上限、CSS 属性清单和 Mermaid 偏移常量均不再散落在原渲染文件中。框架修复后，可以删除两个 workaround 文件，并移除上述三个调用点及一个 `<script>` 标签。

## 2. 运行环境与现象

验证设备的窗口信息约为：

```text
逻辑分辨率：361 x 804
物理分辨率：1084 x 2412
设备像素比：3
```

框架层已有修改会读取 SVG 根节点的 `width`、`height` 作为解码目标尺寸。日志中曾观察到类似结果：

```text
Set Svg Desired Size: 89, 43
Set Svg Desired Size: 191, 43
Set Svg Desired Size: 500, 400
```

这些值是逻辑像素尺寸，没有乘设备像素比。在 DPR 为 3 的设备上，低分辨率 PixelMap 被放大显示，导致公式和流程图明显模糊。

除清晰度外，Mermaid SVG 还暴露了两个独立问题：

1. SVG 内 `<style>` 的复杂选择器没有被 HarmonyOS 原生 SVG 解码器完整应用，最初出现黑块、线条或颜色丢失等问题。
2. 样式修复后，`<text>` / `<tspan>` 的文字基线行为仍与浏览器不同，节点文字整体显示在方框上沿附近；连线标签“是/否”基本正常。

此外，Harmony SDK API 26 以下版本无法把未改写的 SVG data URL 直接交给系统原生 Image 链路，大量 SVG 会进入自绘解码并带来明显内存峰值和页面卡顿。框架会扫描并改写含 `<text>` 的 SVG，随后把 data URL 替换为文件 URL 交给原生 Image；无 `<text>` 的 SVG 不触发该改写，仍可能回退到 custom node。API 24 真机还验证过，应用层若在框架扫描前无条件把 Mermaid SVG 写成文件，系统解码不会显示 `<text>/<tspan>`。因此当前按最终 SVG 内容分流：含 `<text>` 时保留 data URL 供框架处理，无 `<text>` 时才由应用层主动写入文件。

| 问题 | 表现 | 应用层处理 |
| --- | --- | --- |
| SVG 解码尺寸使用逻辑像素 | 整体模糊 | 根 `width/height` 乘 DPR，布局尺寸保持不变 |
| SVG CSS 规则未完整生效 | 黑块、颜色和线条异常 | 在浏览器中计算样式并转成 presentation attributes |
| Mermaid 文本基线不一致 | 节点文字位于方框上方 | 只对 `.node text` 增加结构级 Y 轴平移 |
| 原生解码器对 `marker-end` 支持不一致 | 连线末端箭头缺失或异常 | 按路径末端切线生成实体 `<polygon>` 并移除 `marker-end` |
| 低版本无 `<text>` data URL 进入自绘解码 | 大量 SVG 时内存高、页面卡顿 | API < 26 时由应用层写入缓存文件，API >= 26 保持 data URL |
| 低版本文件 SVG 丢失文字 | Mermaid 图形存在但节点和连线标签为空 | 含 `<text>` 的 SVG 保持 data URL，让框架完成文字改写后再进入原生 Image |

## 3. 应用层处理流程

整体数据流如下：

```text
MathJax / Mermaid 源文本
        |
        v
WebView 生成标准 SVG DOM
        |
        +-- 记录 SVG 的逻辑显示尺寸
        +-- HarmonyOS 下将根 width/height 乘 DPR
        +-- Mermaid 下将计算后的 CSS 写入元素属性
        +-- Mermaid 节点文字增加临时基线补偿
        +-- Mermaid pointEnd marker 转成实体 polygon
        |
        v
序列化 SVG -> data:image/svg+xml;base64,...
        |
        v
按最终 SVG 内容和 getSystemInfo().osHarmonySDKAPIVersion 分流
        |
        +-- 含 text：保持 data URL，交给框架扫描、改写并转原生 Image
        +-- 无 text 且 API < 26：base64 写入 CACHE_PATH/ai-svg-cache/*.svg
        +-- 无 text 且 API >= 26：保持 data URL
        |
        v
原生 image 组件解码高分辨率 SVG
        |
        v
组件仍按原逻辑宽高布局显示
```

关键点是把“图片解码像素尺寸”和“组件布局逻辑尺寸”分开：

```text
decodeWidth  = logicalWidth  * DPR
decodeHeight = logicalHeight * DPR

layoutWidth  = logicalWidth
layoutHeight = logicalHeight
```

## 4. 清晰度修复：按 DPR 提高解码尺寸

### 4.1 HarmonyOS 平台获取缩放比例

核心判断如下（实际实现会缓存系统 API 版本，避免重复读取）：

```uts
export function getHarmonySvgWorkaroundConfig(): HarmonySvgWorkaroundConfig {
	let rasterScale = 1
	let enabled = false
	let sdkApiVersion = 0
	let useFileSource = false
	// #ifdef APP-HARMONY
	rasterScale = Math.max(1, Math.min(uni.getWindowInfo().pixelRatio, 3))
	enabled = true
	sdkApiVersion = uni.getSystemInfoSync().osHarmonySDKAPIVersion ?? 0
	useFileSource = sdkApiVersion < 26
	// #endif
	return {
		rasterScale,
		enabled,
		useFileSource,
		sdkApiVersion,
		cacheVariant: enabled
			? 'harmony-v2:' + rasterScale.toString() + ':' + (useFileSource ? 'file' : 'data')
			: 'default'
	}
}
```

该逻辑只在 HarmonyOS 生效，其他平台保持 `1`。上限暂定为 `3`，避免异常设备参数产生过大的 PixelMap。系统未返回 API 版本时按低版本处理。WebView 会随最终 SVG 返回 `hasTextElements`：含 `<text>` 时保留 data URL，让框架完成必要的文字预处理；无 `<text>` 时才允许低版本文件来源兜底，避免 MathJax 或少见的无文字 Mermaid 再次进入高内存的自绘路径。

渲染请求会把该值发送给 WebView：

```uts
proxyWeb.callMethod({
	action: 'renderMermaid',
	mermaidText,
	theme: renderTheme,
	rasterScale: workaround.rasterScale,
	inlineComputedStyles,
	normalizeMermaidNodeText,
	normalizeMermaidEdgeLabels,
	materializeMermaidPointEndMarkers,
	iosCoreSvgCompatibility,
	harmonyWorkaround: workaround.enabled
}, callback)
```

同时，缓存键包含模块返回的 `cacheVariant`，避免不同 DPR 或兼容模式下错误复用旧图片：

```uts
function cacheKey(theme: string, source: string, workaroundVariant: string): string {
	return normalizedTheme(theme) + '\n' + workaroundVariant + '\n' + source
}
```

### 4.2 只放大 SVG viewport，不修改 viewBox 和布局尺寸

SVG 归一化时先保存原始逻辑尺寸，再放大根节点的 `width`、`height`：

```js
const size = this.svgNaturalSize(svgElement, options.em || 16, options.ex || 8);
if (options.naturalSize === true) {
  svgElement.setAttribute('width', size.width.toFixed(2) + 'px');
  svgElement.setAttribute('height', size.height.toFixed(2) + 'px');
} else if (viewBox != null) {
  svgElement.setAttribute('width', viewBox[2].toString());
  svgElement.setAttribute('height', viewBox[3].toString());
}

window.harmonySvgWorkaround.applyDecodeScale(svgElement, options.rasterScale);

return {
  svgText: new XMLSerializer().serializeToString(svgElement),
  width: size.width,
  height: size.height
};
```

其中 `applyDecodeScale()` 位于独立的 `harmony-svg-workaround.js`，只负责在缩放值大于 `1` 时放大已经计算好的根 `width/height`。基础 SVG 尺寸计算仍属于原渲染流程，因此移除 HarmonyOS 规避模块不会破坏其他平台。

这里不改变 `viewBox`，因此 SVG 内部坐标、图形比例和文字排版没有变化。返回给业务组件的仍是 `size.width/height`，所以页面布局也不会放大三倍。

伪代码可简化为：

```text
logicalSize = readSvgLogicalSize(svg)
dpr = clamp(devicePixelRatio, 1, 3)

svg.width  = logicalSize.width  * dpr
svg.height = logicalSize.height * dpr

dataUri = serialize(svg)
image.src = dataUri
image.styleSize = logicalSize
```

## 5. Mermaid 样式修复：将 CSS 计算结果写入 SVG 属性

Mermaid 输出依赖 `<style>` 和 CSS 类选择器。浏览器内显示正确，但序列化后交给 HarmonyOS SVG 解码器时，部分规则没有生效。

当前规避方式是在 WebView 中把 SVG 临时挂到屏幕外，让浏览器完成 CSS 级联，然后将关键的 `getComputedStyle()` 结果写到每个图元的 presentation attributes 上：

```js
inlineComputedStyles(svgElement) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-100000px;top:0;pointer-events:none;';
  const liveSvg = document.importNode(svgElement, true);
  host.appendChild(liveSvg);
  document.body.appendChild(host);

  try {
    const styleProperties = [
      'color', 'fill', 'fill-opacity', 'fill-rule',
      'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
      'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
      'stroke-dashoffset', 'opacity', 'font-family', 'font-size',
      'font-style', 'font-weight', 'letter-spacing', 'text-anchor',
      'dominant-baseline', 'alignment-baseline', 'paint-order',
      'stop-color', 'stop-opacity', 'vector-effect'
    ];

    const paintedNodes = liveSvg.querySelectorAll(
      'path,rect,circle,ellipse,polygon,polyline,line,text,tspan,marker,stop'
    );

    paintedNodes.forEach(node => {
      const computedStyle = window.getComputedStyle(node);
      styleProperties.forEach(property => {
        const value = computedStyle.getPropertyValue(property).trim();
        if (value.length > 0) node.setAttribute(property, value);
      });
    });

    liveSvg.querySelectorAll('style').forEach(node => node.remove());
    return liveSvg;
  } finally {
    host.remove();
  }
}
```

转换示意：

```xml
<!-- 转换前：依赖 CSS 选择器 -->
<style>.node rect { fill: #ececff; stroke: #9370db; }</style>
<g class="node"><rect /></g>

<!-- 转换后：解码器无需执行 CSS 级联 -->
<g class="node">
  <rect fill="rgb(236, 236, 255)" stroke="rgb(147, 112, 219)" />
</g>
```

此处的完整样式展开在 HarmonyOS 和 iOS Mermaid 路径启用。iOS 先让浏览器完成 CSS 级联并删除原始 `<style>`，再执行第 6.3 节的定向 CoreSVG 结构兼容处理；MathJax、Web 和 Android 不做该 DOM 复制与样式展开。

## 6. Mermaid 文字基线语义兼容

### 6.1 失败过的尝试

第一次尝试在 `<text>` 上设置相对位移：

```js
text.setAttribute('dy', '0.35em');
```

真机截图显示几乎没有变化。Mermaid 的实际文字位置还受子 `<tspan>` 的 `x/y/dx/dy` 和基线属性影响，父 `<text>` 上的 `dy` 可能被子节点坐标覆盖；HarmonyOS 对这些属性的组合处理也与浏览器不一致。

### 6.2 HarmonyOS 语义等价方案

旧方案给 `.node text` 统一包裹 `translate(0 16)`，虽然在当前真机和默认 `16px` 字号下显示正常，但它依赖解码器忽略 `<tspan dy="1em">` 的非标准表现。一旦字号或 Mermaid 输出结构变化，就可能发生二次偏移。

当前只匹配已经验证的单行节点结构：一个 `.node > .label`、一个 `<text>`、一个 `<tspan x="0" dy="1em">`。浏览器挂载 SVG 后读取 `<text>` 的实际 `font-size`，把相对基线位移合并到标签组的已有 `translate`，再删除 `tspan` 的 `x/dy`：

```js
normalizeSingleLineNodeLabels(svgElement) {
  svgElement.querySelectorAll('.node').forEach(node => {
    const label = directChildWithClass(node, 'label');
    const text = directChildrenByTagName(label, 'text')[0];
    const tspan = directChildrenByTagName(text, 'tspan')[0];
    if (tspan.getAttribute('x') !== '0' || tspan.getAttribute('dy') !== '1em') return;

    const translate = parsedTranslate(label.getAttribute('transform'));
    const fontSize = Number.parseFloat(getComputedStyle(text).fontSize);
    label.setAttribute(
      'transform',
      'translate(' + translate.x + ', ' + (translate.y + fontSize) + ')'
    );
    tspan.removeAttribute('x');
    tspan.removeAttribute('dy');
  });
}
```

以默认 `16px` 字号为例，标准 SVG 中 `translate(0, -9.5)` 与 `dy="1em"` 的最终基线是 `6.5`。转换后直接表达为同一个位置：

```xml
<!-- 转换前 -->
<g class="label" transform="translate(0, -9.5)">
  <text><tspan x="0" dy="1em">条件判断</tspan></text>
</g>

<!-- 转换后 -->
<g class="label" transform="translate(0, 6.5)">
  <text><tspan>条件判断</tspan></text>
</g>
```

这不是视觉补偿：转换前后遵循标准 SVG 时位置完全相同。它只是把鸿蒙解码器不能稳定处理的相对 `em` 基线改成确定坐标。流程线上的 edge label 不进入该节点规则；多行、非 `1em` 或 transform 无法解析的节点保持原样。

### 6.3 单行边标签坐标兼容

HarmonyOS 对 Mermaid edge label 的外层定位、内层标签定位和背景 `<rect x/y>` 组合处理不一致，表现为“通过/拒绝”文字位置正确，但半透明背景矩形向右下偏移。当前复用 iOS 已验证的语义等价改写，只匹配一个 `rect`、一个 `text`、一个 `<tspan x="0" dy="1em">` 的单行边标签：把两层 `translate`、矩形坐标和文字基线合并为绝对坐标，并把元素 `opacity * fill-opacity` 合并到背景的 `fill-opacity`。

该处理不使用固定像素补偿。未知结构、多行标签或无法解析的 transform 保持原样。

### 6.4 流程图箭头 marker 实体化

HarmonyOS 和 iOS 共用 Mermaid 标准 `flowchart-pointEnd` marker 的实体化处理。WebView 将 SVG 临时挂载后，读取 marker 的 `viewBox`、`refX/refY`、`markerWidth/markerHeight`、`markerUnits` 和图元包围盒，再按路径终点与末端切线把 marker 坐标转换为页面坐标，生成实体 `<polygon>` 并移除原路径的 `marker-end`。

Mermaid 当前 pointEnd marker 的 `viewBox` 为 `0 0 10 10`、`refX` 为 `6`、viewport 为 `12 x 12`，所以标准 Web 渲染中箭头尖端会越过路径终点 `(10 - 6) * 12 / 10 = 4.8` 个逻辑单位。旧实体化实现把路径终点直接当作箭头尖端，遗漏了这段前伸量，并使用了较窄的经验半宽，因而在节点前留下小空隙。当前实现按 marker 原始语义同时还原前伸量、后沿位置和宽度，不再使用固定箭头尺寸。

该处理仅匹配引用 ID 以 `_flowchart-pointEnd` 结尾、且 marker 内存在无额外 transform 的 `path.arrowMarkerPath` 的标准 Mermaid 结构；无法读取 marker 或路径几何时保持原样。鸿蒙和 iOS 缓存键都会加入 `materialized-point-end-v2`，避免复用旧的短箭头 SVG。

### 6.5 iOS CoreSVG 语义兼容

iOS 先共用第 5 节的浏览器 CSS 烘焙和第 6.4 节的箭头实体化；随后按照 CoreSVG 兼容样例及真机结果做三项定向处理，其中第 2 项复用第 6.2 节的单行节点语义等价实现：

1. 只把 `.node > rect.label-container` 和 `.node > polygon.label-container` 的计算后 `fill`、`stroke`、`stroke-width` 写入元素 `style`，保留原始 `<style>` 和其他元素属性。
2. 只匹配单个 `<tspan x="0" dy="1em">` 的单行节点标签。读取实际 `font-size`，把父标签组的 `translate(x, y)` 改为 `translate(x, y + fontSize)`，然后删除该 `tspan` 的 `x` 与 `dy`。默认 `16px` 字号下，`translate(0, -9.5)` 等价转换为 `translate(0, 6.5)`。
3. 对单行 edge label，把外层定位和内层居中的两个 `translate` 合并到同一坐标系：背景矩形改写为绝对 `x/y`，文字使用 `labelX, labelY + fontSize` 的基线位置并移除 `tspan x/dy`。同时只把背景与文字实际需要的计算样式写入内联 `style`；文字属性还同步写成 SVG presentation attributes，绕过 CoreSVG 对 `<text>/<tspan>` 内联 CSS 的不稳定处理。矩形的元素 `opacity` 与 `fill-opacity` 相乘后只写入 `fill-opacity`，标签组和矩形本身固定为 `opacity:1`，防止 CoreSVG 把背景的半透明错误作用到文字。坐标、颜色和有效透明度均来自 SVG 在浏览器中的计算结果，不按“通过/拒绝”内容判断，也不使用固定偏移或固定颜色。
多行、非 `1em`、空标签或 transform 无法解析的节点与边标签保持原样，避免把单一样例规则错误扩展到未知结构。iOS 缓存变体使用 `ios-coresvg-v5`，防止复用旧 SVG。

## 7. 实际迭代与验证结果

| 轮次 | 修改 | 结果 |
| --- | --- | --- |
| 1 | 仅按 SVG 根逻辑尺寸解码 | 公式和流程图模糊 |
| 2 | 根 `width/height` 乘 DPR，布局仍用逻辑尺寸 | 数学公式清晰且正常；Mermaid 仍有样式缺失 |
| 3 | Mermaid CSS 计算结果写入元素属性 | 方框、连线、箭头和颜色恢复；节点文字向上偏移 |
| 4 | 在父 `<text>` 设置 `dy="0.35em"` | 真机几乎没有改善 |
| 5 | 仅给 `.node text` 包裹 `translate(0 16)` | 人工验证显示正常，但属于默认字号下的经验补偿 |
| 6 | 按实际字号把 `tspan dy="1em"` 合并到父标签 `translate` | 标准 SVG 几何不变；nova 12 真机节点文字位置与 Web 一致 |
| 7 | 把单行 edge label 的两层 `translate`、背景坐标和文字基线合并 | nova 12 真机“通过/拒绝”背景与文字对齐，不再出现右下阴影；其他流程图元素无回归 |
| 8 | 将 iOS 已验证的 pointEnd marker 实体化同步到 HarmonyOS | 应用层不再依赖鸿蒙原生 SVG 解码器解析 Mermaid `marker-end` |
| 9 | 按 marker viewport 和 refX/refY 还原实体箭头几何 | 鸿蒙与 iOS 的实体箭头恢复 Web 的前伸量、长度和宽度，不再在节点前留空隙 |

验证过程中始终把数学公式、节点文字和边标签作为三个独立观察项，避免为修复流程图而破坏已经正常的公式或“是/否”标签。

### 7.1 Issue 32152 真机内存回归

本次使用 Issue 32152 原复现工程中的 18 个不同 MathJax SVG data URL 做 A/B 回归。测试设备为 nova 12（BLK-AL00），系统版本为 `6.1.0.135`，`osHarmonySDKAPIVersion` 为 `24`，运行基座为 HBuilderX `5.26.2026081704-dev`。这些 SVG 的组件显示尺寸为 `88/106 x 43`，但原始 `viewBox` 达到 `4851/5851 x 2400`。

Issue 原复现记录中，18 张图一次加载会把 `VmHWM` 从约 `497740 kB` 推高至 `1375200 kB`，增量约 `856.9 MiB`，日志中的 SVG 解码目标曾达到 `5851 x 2400`。

| 分支 | 轮次 | 稳定后 PSS | `VmHWM` | PSS 增量 | 屏幕指标 |
| --- | --- | ---: | ---: | ---: | --- |
| 直接 data URL | 1 | `89473 kB` | `152996 kB` | `+2532 kB` | 18/18，119 FPS，最大帧间隔 75 ms |
| 直接 data URL | 2 | `90614 kB` | `152300 kB` | 启动基线过早，不计 | 18/18，119 FPS，最大帧间隔 67 ms |
| API 24 自动文件路径 | 1 | `109430 kB` | `176496 kB` | `+39846 kB` | 18/18，121 FPS，最大帧间隔 58 ms |
| API 24 自动文件路径 | 2 | `108097 kB` | `174004 kB` | `+36531 kB` | 18/18，120 FPS，最大帧间隔 59 ms |

两条路径、四轮运行均加载成功且无 SVG 错误，解码日志中的目标尺寸始终为 `88/106 x 43`，没有再按 `viewBox` 解码。因此，API 24 文件路径兜底已避免 Issue 32152 中 MathJax 的内存暴涨和滚动卡顿。

同时需要注意：在当前 HBuilderX 5.26 测试包中，直接 data URL 路径也没有复现原问题，而且比文件路径少约 `36-40 MiB` 的 PSS 增量。但该路径的日志仍先出现 `Desired Size: 0,0`，说明 API 24 并没有获得系统原生 data URL 支持，只是当前 ImageKnife 回退解码最终选用了 `88/106 x 43`。

进一步比对发现，5.25 与 5.26 虽然都声明 `imageknifepro 1.0.13-rc.0`，实际打包的 `imageknifepro.har` 及其中的 arm64 `libimageknifepro.so` 哈希均不相同。结合开发人员确认未对该功能做正式修复，不能把本次直接 data URL 的结果视为稳定的版本能力或兼容承诺。因此 MathJax 仍以 Harmony SDK API 为准：API `< 26` 写入缓存文件，API `>= 26` 才直接使用 data URL；直接路径数据只作为依赖行为变化的诊断记录。

### 7.2 Mermaid 文件 SVG 文字回归

在同一台 API 24 真机上对同一份 Mermaid 流程图做单变量 A/B：文件路径模式下，方框、菱形、连线和箭头均能显示，但所有节点 `<text>/<tspan>` 以及边标签“通过/拒绝”均为空；只把 Mermaid 图片来源切回 data URL 后，节点和边标签全部恢复，其他处理不变。

这说明问题位于 `Image` 加载未经文字预处理的外部 SVG 文件的解码路径，不能由 ArkUI SVG 组件文档列出的标签能力推导出文件图片解码器也支持相同标签。当前应用层因此让含 `<text>` 的最终 SVG 保持 data URL，由框架扫描和改写；无 `<text>` 的 MathJax 或 Mermaid 才使用 API `< 26` 文件兜底。

## 8. 建议的框架层修复

### 8.1 正确传递 SVG 解码目标尺寸

建议框架在 `image` 完成布局、目标逻辑宽高非零后，明确向 SVG 解码器传递物理像素目标尺寸：

```text
targetPixelWidth  = ceil(layoutWidth  * density)
targetPixelHeight = ceil(layoutHeight * density)
```

推荐流程伪代码：

```kotlin
fun buildSvgDecodeRequest(layoutSize: Size, density: Float): DecodeRequest {
    if (layoutSize.width <= 0 || layoutSize.height <= 0) {
        return deferUntilLayoutReady()
    }

    val pixelWidth = ceil(layoutSize.width * density).toInt()
    val pixelHeight = ceil(layoutSize.height * density).toInt()

    return DecodeRequest(
        desiredWidth = clampDecodeWidth(pixelWidth),
        desiredHeight = clampDecodeHeight(pixelHeight)
    )
}
```

框架层应分别保存：

- 组件布局使用的逻辑尺寸；
- PixelMap / Texture 使用的物理像素尺寸。

不建议使用 SVG `viewBox` 作为默认 PixelMap 宽高。`viewBox` 是用户坐标系，可能是数千甚至数万个单位，并不等于期望解码像素数。

如果布局尺寸发生变化，应按新的物理像素目标重新请求或重用合适尺寸的缓存。缓存键至少要包含资源标识、目标像素尺寸和 density 等级。

### 8.2 完整支持 SVG CSS 级联

建议核查 HarmonyOS 当前 SVG 解析器对以下内容的支持情况：

- SVG 内嵌 `<style>`；
- class、后代、组合选择器；
- CSS 继承和优先级；
- `currentColor`；
- `fill`、`stroke`、字体和 marker 相关属性；
- CSS 声明与 presentation attributes 的覆盖顺序。

如果底层 SVG 库无法完整支持 CSS，可以在框架解码前增加标准化步骤，但应使用完整的 CSS/SVG 解析器，而不是用正则替换样式文本。

### 8.3 修复 `<text>` / `<tspan>` 的基线语义

建议用浏览器渲染结果作为对照，逐项核查：

- `text-anchor`；
- `dominant-baseline`；
- `alignment-baseline`；
- `<text>` 与嵌套 `<tspan>` 的 `x/y/dx/dy`；
- `em` 等相对长度单位；
- 父子节点位移的叠加规则；
- 实际字体 ascent、descent 和 baseline 指标。

框架层正确修复后，Mermaid 原始 SVG 不应需要 `translate(0 16)` 之类的业务补偿。

### 8.4 防止过早解码

如果首次设置 `src` 时组件还未完成布局，不应以 `0 x 0` 目标直接进入大尺寸 SVG 解码。建议等待有效布局尺寸，或在布局完成后取消错误请求并用正确目标尺寸重新解码。

## 9. 建议增加的框架测试

建议建立 SVG fixture 和截图回归，至少覆盖：

1. MathJax：大 `viewBox`、小逻辑尺寸、负 `minY`。
2. Mermaid：`htmlLabels: false` 的流程图。
3. CSS：内嵌 `<style>`、class 和后代选择器、`currentColor`。
4. 图形：path、rect、polygon、marker 和 arrowhead。
5. 文字：单层 text、多层 tspan、x/y/dx/dy、不同 baseline 属性。
6. 像素密度：DPR 1、2、3 下的解码尺寸和截图清晰度。
7. 生命周期：先设置 `src` 后布局、先布局后设置 `src`、布局尺寸动态变化。
8. 缓存：同一 SVG 在不同目标尺寸和不同 DPR 下不得错误复用低分辨率结果。

建议同时断言：

```text
desiredDecodeSize == layoutLogicalSize * DPR
```

并将 HarmonyOS 输出与 Chromium/WebView 的参考截图进行像素或结构对比。文字抗锯齿可以设置容差，但不应允许整体基线偏移、图形丢失或颜色错误。

## 10. 应用层方案的边界

当前方案可以作为框架修复前的 HarmonyOS 临时规避，但存在以下边界：

1. `width/height * DPR` 是为了适配当前解码器行为，框架正确传递物理像素目标后应移除。
2. `getComputedStyle()` 展开依赖浏览器 DOM，会增加一次 DOM 挂载、样式计算和序列化开销，应配合缓存使用。
3. 节点文字语义改写只处理已验证的单行 `tspan x="0" dy="1em"` 结构；多行和未知结构保持原样。
4. 完整样式展开用于 HarmonyOS 和 iOS Mermaid；两端共用已验证的单行节点与单行边标签语义改写，iOS 额外处理节点形状样式和标准 pointEnd marker，未知结构保持原样。HarmonyOS 解码缩放和文件来源分流继续由独立条件开关控制，Web 与 Android 保持原路径。
5. 框架升级后需要关闭应用层处理重新测试，防止框架修复与业务补偿叠加。
6. API `< 26` 的应用层文件缓存只用于最终内容不含 `<text>` 的 SVG；含 `<text>` 的 SVG 必须保留 data URL，让框架先完成文字预处理。

## 11. 结论

本次问题由五个层面叠加造成：低版本 data URL 加载路径的内存压力、文件 SVG 解码遗漏 `<text>/<tspan>`、解码目标没有按 DPR 转为物理像素、SVG CSS 级联兼容不完整，以及文字基线语义与浏览器不一致。

HarmonyOS 应用层通过“高分辨率解码、计算样式内联、节点文字基线语义等价化、单行边标签坐标与透明度等价化”完成规避；iOS 在共用文字规则的基础上，额外使用节点样式定向内联和实体箭头规避 CoreSVG 差异。框架层的最终目标仍是让业务直接提交标准 SVG，即可在正确的目标像素尺寸下得到与浏览器一致的样式和文字布局，而不需要改写 SVG 内容。
