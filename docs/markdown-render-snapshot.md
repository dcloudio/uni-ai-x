# Markdown 最终渲染快照

Android、Harmony 消息使用 `MsgItem.renderSnapshot` 保存最终展示块；`body` 保留 Markdown 原文。

- 快照包含格式版本、正文指纹、主题、窗口宽度、引用编号、图片清单和完整展示块。
- 流式结束后，等待代码高亮、行内公式及公式/图表图片就绪，再交给快照 Worker。
- Worker 把生成图片转存到 `USER_DATA_PATH/ai-render-assets/<消息指纹>/`，按内容去重，临时文件写完后重命名。快照内使用相对资源引用，不保存临时目录路径或图片 Base64。
- 图片完成后才提交带快照的原消息。Android 使用原生 IO 存储队列；Harmony 消息读写、序列化、删除使用同一个 Worker 队列。
- 历史消息在加入展示列表前恢复快照。格式、正文、主题、宽度、引用或资源校验失败时才重建并补存；无缓存时不展示 Markdown 原文占位。
- 删除消息会清理对应图片。重新生成、删除及主题变更会使过期的异步结果失效。压测复制消息不共享原消息的图片所有权。

原生视图仍需正常布局和图片解码。缓存命中时跳过 Markdown 解析、代码高亮和图片生成。

## 验证

自动测试：`node --test tests/render-snapshot.test.mjs tests/libmark-storage.test.mjs tests/code-presentation.test.mjs`。

Android 真机完整 Markdown 示例：流式结束后持久化 26 个展示块、13 个图片文件；IO 线程日志确认图片处理位于后台线程。杀进程重启后，两条测试消息直接恢复展示块，没有触发 Markdown 重建或公式 WebView。临时验证入口和日志代码已移除，采样记录位于不提交的 `uni-agent-artifacts/`。
