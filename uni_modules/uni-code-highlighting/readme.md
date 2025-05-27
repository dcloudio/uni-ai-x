# uni-code-highlighting

## 本插件支持基于 TextMate 语法规则（如 javascript.tmLanguage.json）的前端代码高亮渲染
### 功能介绍
- 用于代码文本高亮



##  使用指南：基于 TextMate Grammar 的前端语法高亮插件

本插件支持基于 TextMate 语法规则（如 javascript.tmLanguage.json）的前端代码高亮渲染。


###  快速开始

1. 引入uni-modules插件
``` typescript
import { createHighLighter } from "../../uni_modules/uni-code-highlighting"
```
2. 准备语法定义文件（.tmLanguage.json）

从 VSCode 官方仓库中下载你需要的语法定义文件，例如：
	•	JavaScript.tmLanguage.json
	•	TypeScript.tmLanguage.json

确保你的语法文件使用 JSON 格式。

⸻

3. 初始化高亮器

``` typescript
import grammar from './javascript.tmLanguage.json'
	let uniCodeHighlighter = await createHighLighter({
		languages: {
			'javascript': grammar
		}
	})
```


4. 传入代码文本进行高亮

```typescript
const sourceCode =
`
import App from './App.uvue'

import { createSSRApp } from 'vue'
export function createApp() {
	const app = createSSRApp(App)
	return {
		app
	}
}
`

let res = await uniCodeHighlighter.tokenizeFullText('javascript', sourceCode)

```



5. 配置样式（CSS）

你可以为不同 scope 定义样式类，例如：

``` css
.tok-keyword { color: #d73a49; font-weight: bold; }
.tok-variable { color: #6f42c1; }
.tok-string { color: #032f62; }
.tok-number  { color: #005cc5; }
.tok-comment { color: #6a737d; font-style: italic; }
```



###  IToken 数据结构说明

高亮器返回的 token 结构如下：
``` typescript
export interface IToken {
  readonly startIndex: number
  readonly endIndex: number
  readonly scopes: string[]
}

export interface ILineTokens {
  readonly tokens: IToken[]
  readonly state: any  // 用于跨行状态管理（如多行注释）
}

```



