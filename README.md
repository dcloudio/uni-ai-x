# 简介

> uni-ai x v3.0.0 新增于 HBuilderX 5.26

`uni-ai x`，是一个基于uni-app x 蒸汽模式的开源的、全平台的、原生的、云端一体的ai聊天套件。

能够连接ai大模型，真流式接收和输出内容，原生渲染markdown。

## 项目背景：
市面上开源的AI聊天套件大多以Web端为主，像ChatGPT、DeepSeek等的App端并不开源。  
而通过Web-view接入AI的体验差强人意，自己开发面临如下核心挑战：  
- **流式网络请求**：基于POST的SSE技术实现实时数据传输  
- **Markdown流式解析**：动态解析富文本格式标记  
- **编程语言代码高亮**：实现语法识别与样式渲染  
- **Table表格解析渲染**：结构化数据的可视化呈现  
- **流式排版性能**：确保内容加载不阻塞UI交互操作  
- **跨平台开发困境**：缺乏成熟跨平台框架，鸿蒙端开发尤为艰难  
- **极致性能要求**：每个Token需同步完成Markdown解析、代码高亮及排版渲染，运算密集且不能卡顿UI  

**uni-ai x由此应运而生**，专注攻克全平台原生AI聊天场景的技术痛点。

可以满足开发者的如下需求：
1. 基于`uni-ai x`开发全新的ai应用
2. 在之前的app中引入`uni-ai x`的sdk，给app补充ai聊天能力
3. 客户端和服务器均开源，可以自由定制扩展

## 功能和特点

`uni-ai x`功能上参考 deepseek 的客户端设计，并扩展了更多平台。

1. 多端支持与主题适配 
支持Web/H5、iOS、Android、鸿蒙 App、微信小程序。Web 端采用响应式布局，适配 PC 宽屏和移动设备，并提供浅色和暗黑两种主题模式
2. 丰富的 AI 服务集成与高级功能 
集成多家主流 AI 服务商，用户可灵活切换不同 AI 模型，部分模型支持"深度思考"和"联网搜索"等高级能力
3. 消息与会话管理  
支持多轮对话和历史会话管理，具备会话切换、删除、自动创建等功能，提供完整的 AI 聊天体验
4. 高级渲染与输出特性 
支持 AI 回复内容的流式输出和原生 Markdown 格式渲染，内置高性能解析器，支持代码高亮和复杂文本结构展示

### uni-ai x 在主流 AI 客户端横评中流式渲染性能领先

与 ChatGPT、Gemini、豆包、DeepSeek 的 Android 版对比，uni-ai x 在完整渲染所测 Markdown 内容的同时，流式回复的慢帧次数和慢帧总耗时均为最低；鸿蒙版与豆包的对比也同样领先。详细测试数据与方法见[uni-ai x 与主流 AI 客户端横评报告](uni-ai-x-report.md)。

各端效果如下截图，依次平台为：iOS、Android、鸿蒙<br/>
<img width="200px" src="https://img-cdn-tx.dcloud.net.cn/stream/plugin_screens/69cf7a60-4b4d-11f0-acb4-1f9e73bd04f1_3.jpg/webp?&v=1752044804"/>
<img width="260px" src="https://img-cdn-tx.dcloud.net.cn/stream/plugin_screens/69cf7a60-4b4d-11f0-acb4-1f9e73bd04f1_1.png/webp?&v=1752044564"/>
<img width="200px" src="https://img-cdn-tx.dcloud.net.cn/stream/plugin_screens/69cf7a60-4b4d-11f0-acb4-1f9e73bd04f1_2.png/webp?&v=1752044569"/>
<br/>
web pc端：
<br/>
<img width="630px" src="https://img-cdn-tx.dcloud.net.cn/stream/plugin_screens/69cf7a60-4b4d-11f0-acb4-1f9e73bd04f1_0.png/webp?&v=1752044560"/>

### Android端demo：

<img width="200px" src="https://web-ext-storage.dcloud.net.cn/uni-app-x/uni-ai-x/uni-ai-x-portal-qrcode.png"/>

扫码或[点此下载](https://web-ext-storage.dcloud.net.cn/uni-app-x/uni-ai-x/uni-ai-x-portal.html)


## 安装步骤  @install

1. 下载示例项目  
打开`uni-ai x`插件下载地址：[https://ext.dcloud.net.cn/plugin?name=uni-ai-x](https://ext.dcloud.net.cn/plugin?name=uni-ai-x) 

2. 绑定项目的服务空间  
- 不基于unicloud的项目，无需绑定服务空间；删除`uni_modules`目录下的`uni-ai-x/uniCloud` 即可。
- 基于[unicloud](https://doc.dcloud.net.cn/uniCloud/)的项目，在项目根目录uniCloud右键选择"关联云服务空间或项目"，关联你的服务空间

3. 配置获取临时鉴权token的方法 （仅作为OpenClaw channel时可跳过）
为提供更好的用户体验，uni-ai x 由客户端直接连接 AI 服务器。同时为了保证在前端调用大模型时不暴露服务商的apiKey信息，特采用方案：前端调用服务端接口获取临时 token 后，使用临时 token 调用服务商的api。
- 不基于unicloud的项目，需要先注册[阿里百炼](https://bailian.console.aliyun.com/)账户并[创建 API-Key](https://bailian.console.aliyun.com/?tab=model#/api-key)根据[文档](https://help.aliyun.com/zh/model-studio/obtain-temporary-authentication-token)提供获取临时鉴权 token 接口。并配置到`/uni_modules/uni-ai-x/config.uts`，bailian -> getToken 内

- 基于unicloud的项目，默认将通过 uni-ai-x-co 获取；
	+ uni-ai-x 版本号1.1.0起，客户端默认 AI 服务商为：七牛云，[开通uni-ai 网关](https://doc.dcloud.net.cn/uniCloud/uni-ai-buy.html#enable-uni-ai-service)即可使用。
	+ 旧版本默认使用“阿里云百联”要将API-Key配置到`uniCloud/cloudfunctions/common/uni-config-center/uni-ai-x/config.json`（此配置文件需手动创建）\
	配置示例：
	```json
	{
			"apiKey":{
					"bailian": "sk-2****7"
			} 
	}
	```

4. 运行项目  
在菜单点击`运行`，选择要运行的客户端。

**注意:** 运行到 App 端需要打自定义基座


5. 客户端配置 @config-client
配置文件路径：`/uni_modules/uni-ai-x/config.uts`

- 配置用户信息（可选）@UserInfo

| 字段名					| 类型				| 说明																				|
| -----------		| ----------| ------------------------------						|
| currentUser		| Userinfo	| 左侧菜单区域下方的用户头像信息									|
| userCenterPage| string		| 点击左侧菜单区域下方的用户头像信息后跳转的页面路径	|

默认例子（顶部被注释的代码）适用于基于 unicloud + [uni-id-pages-x](https://doc.dcloud.net.cn/uniCloud/uni-id/summary.html) 的项目的，解开注释即可使用。
非 unicloud 项目，参考此示例简单修改即可

- 配置服务商与模型
请直接参考插件预置配置信息 `llmModelMap` 下的内容
**注意：** OpenClaw，需配合[uni-ai-openclaw-channel-plugin](https://gitcode.com/dcloud/uni-ai-openclaw-channel-plugin)插件使用

**Provider 服务商** @Provider
| 字段名				| 类型				| 说明																		|
| -----------	| ----------| ------------------------------				|
| models			| LLMModel\[\]| 该服务商下支持的模型列表[详见](#LLMModel)	|
| description	| string		| 服务商描述信息，用于 UI 展示							|
| baseURL			| string		| API 基础地址，部分服务商需要							|
| getToken		| function	| token 获取方法													|

**LLMModel 模型** @LLMModel
| 字段名			| 类型			| 说明															|
| ---------	| -------	| -------------------------------	|
| name			| string	| 模型名称，需与服务商实际支持的模型一致	|


更多相关文档：
1. uni-ai x 基于uni-ai，uni-ai的文档[详情参考](uni-ai.md)
2. 通义大模型应用上架及合规备案[详情参考](https://bailian.console.aliyun.com/?tab=doc#/doc/?type=model&url=https%3A%2F%2Fhelp.aliyun.com%2Fdocument_detail%2F2667824.html&renderType=iframe)

## 常见问题  
1. 项目不是基于uni-app-x而是基于uni-app开发的如何接入？
答：基于uni-app开发的项目暂不支持接入，但可以接入[uni-ai-chat](./uni-ai-chat.md)
2. 如遇以下报错，则说明你未打自定义基座运行  
- ‌error: app-service.js(4737:38) ReferenceError:Can't find variable: TextDecoder parseChunkData@app-service.js:4737:38‌
- ‌error: java.util.regex.PatternSyntaxException: Syntax error in regexp pattern near index 110‌

## 交流群  
更多问题欢迎[点此](https://im.dcloud.net.cn/#/?joinGroup=68511b0b7ae60eb5c891cfbc)加入uni-ai官方交流群

当前项目正在快速迭代UI体验，请关注本项目，订阅更新通知。

## 声明
本项目依赖以下作品
1. 代码块的字体为 [FiraCode-Regular](https://github.com/tonsky/FiraCode)