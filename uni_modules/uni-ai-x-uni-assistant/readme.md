# Uni 小助手

在应用入口 `main.uts` 添加这一行即可启用：

```uts
import '@/uni_modules/uni-ai-x-uni-assistant/install.uts'
```

插件会在应用读取模型设置前注册「Uni 小助手」，将其放在模型列表首位，并为首次安装的用户设为默认模型。移除导入后，小助手不再出现在模型列表；已保存的小助手选择会按核心现有逻辑切换到可用模型。

请求适配器使用现有 SSE 回答、按聊天保存的 `conversation_id`，并沿用统一的 Markdown 渲染链路。插件不自动调用标题总结。
