# uni-cmark

基于c语言的库[cmark-gfm](https://github.com/github/cmark-gfm.git)封装的、解析markdown的UTS插件，支持在uni-app 和 uni-app x 的 Android、iOS、web、微信小程序平台下使用。

## 功能特点

- **高性能解析**：基于C语言实现的cmark-gfm库，解析性能优异
- **跨平台支持**：支持uni-app 和 uni-app x的Android、iOS、Web、微信小程序平台
- **流式解析**：支持实时流式Markdown解析，特别适用于AI聊天场景
- **完整语法支持**：支持标准Markdown语法和GitHub Flavored Markdown (GFM)扩展

## 基本使用

```typescript
import { md2json, initCmark } from '@/uni_modules/uni-cmark'

// 初始化cmark-gfm库（仅web和微信小程序端需要，其他端为空实现）在使用md2json之前需要调用。
await initCmark()

// 解析Markdown文本
const markdownText = `# 标题
这是一个**粗体**文本和*斜体*文本。

\`\`\`javascript
console.log('Hello World')
\`\`\`
`

const result = md2json(markdownText)
if (result.errorMsg) {
    console.error('解析错误:', result.errorMsg)
} else {
    console.log('解析结果:', result.data)
}
```

**参数：**
- `markdownText: string` - 要解析的Markdown文本

**返回值：**
```typescript
type ParseMdRes = {
    data: MarkdownToken[],
    errorMsg: string
}
```

### 数据结构

#### `MarkdownToken`

Markdown解析后的节点数据结构：

```typescript
type MarkdownToken = {
    type?: string;           // 节点类型
    raw?: string;           // 原始文本
    text?: string;          // 文本内容
    html?: string;          // HTML内容
    tokens?: MarkdownToken[];  // 子节点
    checked?: number;       // 任务列表是否选中
    escaped?: number;       // 是否转义
    pre?: number;           // 是否为预格式化
    block?: number;         // 是否为块级元素
    ordered?: number;       // 是否为有序列表
    loose?: number;         // 是否为松散列表
    task?: number;          // 是否为任务列表
    inLink?: number;        // 是否在链接中
    inRawBlock?: number;    // 是否在原始块中
    isClose?: number;       // 是否为闭合标签
    codeBlockStyle?: 'indented'; // 代码块样式
    lang?: string;          // 编程语言
    tag?: string;           // HTML标签
    href?: string;          // 链接地址
    title?: string;         // 标题
    depth?: number;         // 深度
    start?: number | string; // 起始值
    items?: MarkdownToken[];   // 列表项
    align?: 'center' | 'left' | 'right'; // 对齐方式
    codeTokens?: MarkdownToken[][]; // 代码标记
    deepIndex?: number;     // 深度索引
    orderedIndex?: number;  // 有序索引
    className?: string;     // CSS类名
    uniqueId?: string;     // 唯一ID
    start_column?: number;  // 起始列
    end_column?: number;    // 结束列
    width?: number;         // 宽度
    height?: number;        // 高度
}
```

## 支持的Markdown语法

### 基础语法
- 标题 (H1-H6)
- 段落和换行
- **粗体** 和 *斜体*
- `行内代码`
- [链接](url) 和 ![图片](url)
- 水平分割线

### 列表
- 无序列表
- 有序列表
- 任务列表
- 嵌套列表

### 代码块
- 围栏代码块
- 缩进代码块
- 语法高亮支持

### 表格
- GitHub风格表格
- 对齐支持

### 引用
- 块引用
- 嵌套引用

### 其他
- 删除线
- 脚注
- 数学公式支持

## 相关项目

- [uni-ai-x](https://gitcode.com/dcloud/uni-ai-x) - 基于uni-cmark的AI聊天套件
- [cmark-gfm](https://github.com/github/cmark-gfm) - 底层C语言库