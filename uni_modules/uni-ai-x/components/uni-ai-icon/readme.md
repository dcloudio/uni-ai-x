# uni-ai-icon

本项目的界面图标组件，使用 DeepSeek Harness 的 MIT 开源 SVG 图形。
来源、固定版本和许可见 `../../static/icons/deepseek/README.md`。

```html
<uni-ai-icon name="globe-outline" size="22" color="var(--text-primary)" />
<uni-ai-icon name="copy-outline" @click="copy" />
```

- `name`：图标名称，对应同目录 `artwork.uts`。未提供或不存在时不显示图形。
- `size`：尺寸字符串，默认 `16`；纯数字按 px 处理，也可传入带单位的值。
- `color`：默认 `var(--text-primary)`，支持具体颜色及项目现有的图标主题变量。
- `click`：转发点击事件；组件根节点直接渲染图片，调用方可使用 class/style。
- `code`：兼容原有 e639、e797、e691、e627、e622、e907、e60c、e633 调用；同时传入时以 name 为准。

图形以 SVG Data URL 渲染。图片不能继承 CSS 变量，因此在组件中将项目的图标调色板解析为当前主题颜色。
主题颜色表与 `static/css/variables.scss` 保持一致。
