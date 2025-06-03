# 简介

`uni-ai-x`，是一个开源的、全平台的、原生的、云端一体的ai聊天套件。

能够连接ai大模型，真流式接收和输出内容，原生渲染markdown。

目前市面上开源的ai聊天大都是web的，ChatGPT、deepseek的App端并不开源。

`uni-ai-x`是原生的，不基于Webview。而且还支持鸿蒙。

`uni-ai-x`可以满足开发者的如下需求：
1. 基于`uni-ai-x`开发全新的ai应用
2. 在之前的app中引入`uni-ai-x`的sdk，给app补充ai聊天能力
3. 客户端和服务器均开源，可以自由定制扩展

`uni-ai-x`基于[uni-app x](https://doc.dcloud.net.cn/uni-app-x/)，uni-app x是一个跨平台开发原生应用的框架。

## 功能和特点

`uni-ai-x`功能上参考 deepseek 客户端设计，并扩展了更多平台。

1. 多端支持与主题适配 
支持Web/H5、iOS、Android、鸿蒙 App、微信小程序。Web 端采用响应式布局，适配 PC 宽屏和移动设备，并提供浅色和暗黑两种主题模式
2. 丰富的 AI 服务集成与高级功能 
集成多家主流 AI 服务商，用户可灵活切换不同 AI 模型，部分模型支持"深度思考"和"联网搜索"等高级能力
3. 消息与会话管理  
支持多轮对话和历史会话管理，具备会话切换、删除、自动创建等功能，提供完整的 AI 聊天体验
4. 高级渲染与输出特性 
支持 AI 回复内容的流式输出和原生 Markdown 格式渲染，内置高性能解析器，支持代码高亮和复杂文本结构展示

## 体验步骤  

前提条件：uni-ai-x 支持的大语言模型服务商为[阿里百炼](https://bailian.console.aliyun.com/)，需要先注册账户并[创建 API-Key](https://bailian.console.aliyun.com/?tab=model#/api-key)

1. 下载示例项目  
打开`uni-ai-x`插件下载地址：[https://ext.dcloud.net.cn/plugin?name=uni-ai-x](https://ext.dcloud.net.cn/plugin?name=uni-ai-x) 
点击`使用HBuilderX导入示例项目`

2. 绑定项目的服务空间  
- 不基于unicloud的项目，可直接删除项目根目录uniCloud目录跳过本步骤
- 基于[unicloud](https://doc.dcloud.net.cn/uniCloud/)的项目，在项目根目录uniCloud右键选择"关联云服务空间或项目"，关联你的服务空间。

3. 配置获取临时鉴权token  
为提供更好的用户体验，uni-ai-x 由客户端直接连接 AI 服务器。同时为了保证在前端调用大模型时不暴露服务商的apiKey信息，特采用方案：前端调用服务端接口获取临时 token 后，使用临时 token 调用服务商的api。

- 不基于unicloud的项目，需要根据[文档](https://help.aliyun.com/zh/model-studio/obtain-temporary-authentication-token)提供获取临时鉴权 token 接口。并配置到`/uni_modules/uni-ai-x/config.uts`，bailian -> getToken 内

- 基于unicloud的项目，默认将通过 uni-ai-x-co 获取，需要将API-Key配置到`uniCloud/cloudfunctions/common/uni-config-center/uni-ai-x/config.json` （需要手动创建）
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


更多** 客户端配置 **说明 @cinfig-client
配置文件路径：`/uni_modules/uni-ai-x/config.uts`

Provider 服务商 @Provider
| 字段名    | 类型       | 说明                           |
| ----------- | ---------- | ------------------------------ |
| models      | LLMModel[] | 该服务商下支持的模型列表[详见](#LLMModel)       |
| description | string     | 服务商描述信息，用于 UI 展示   |
| baseURL     | string     | API 基础地址，部分服务商需要   |
| getToken    | function   | token 获取方法               |

LLMModel 模型 @LLMModel
| 字段名    | 类型    | 说明                               |
| --------- | ------- | -------------------------------  |
| name      | string  | 模型名称，需与服务商实际支持的模型一致 |

目前仅支持阿里云百炼

**目录结构**  
<pre v-pre="" data-lang="">
<code class="lang-" style="padding:0">
uni_modules/uni-ai-x/
├── components/                    
│   ├── uni-ai-x-setting/          // AI设置相关组件
│   ├── uni-ai-x-model/            // AI模型相关组件
│   ├── uni-ai-x-msg/              // 消息相关组件
│   ├── uni-marked-el/             // Markdown渲染相关组件
│   ├── uni-rotate-icon/           // 旋转图标组件
│   ├── uni-ai-icon/               // AI图标组件
│   ├── uni-ai-menu.uvue           // AI菜单组件
│   ├── msg-code.uvue              // 代码消息组件
│   ├── msg-tool-bar.uvue          // 消息工具栏组件
│   ├── uni-ai-chat.uvue           // AI聊天主组件
│   ├── input-tool-bar.uvue        // 输入工具栏组件
│   ├── add-chat-btn.uvue          // 新增对话按钮组件
│   ├── add-chat.uvue              // 新增对话组件
│   ├── ai-menu-left.uvue          // 顶部导航栏菜单左侧组件
│   └── ai-menu-right.uvue         // 顶部导航栏菜单右侧组件
├── sdk/                           // AI能力相关SDK
│   ├── index.uts                  // SDK主入口
│   ├── types.uts                  // 类型定义
│   └── uniCloudSse.uts            // uniCloud SSE相关工具
├── static/                        // 静态资源
│   ├── ai-provider/               // AI服务商图标目录
│   └── font/                      // 字体资源目录
├── pages/                         // 页面目录
│   └── uni-ai.uvue                // AI聊天主页面
├── uniCloud/                      // 云函数相关
│   └── cloudfunctions/            // 云函数目录（属于服务器端文件，不参与打包）
│       └── uni-ai-x-co/        // AI聊天云函数
│           ├── index.obj.js       // 云函数主入口
│           ├── utils.js           // 云函数工具
│           └── package.json       // 云函数依赖描述
├── config.uts                     // 插件配置文件
├── package.json                   // 插件依赖与元数据
├── readme.md                      // 插件说明文档
└── changelog.md                   // 插件更新日志
</code>
</pre>

更多相关文档：
1. uni-ai-x 基于uni-ai，uni-ai的文档[详情参考](uni-ai.md)
2. 通义大模型应用上架及合规备案 https://bailian.console.aliyun.com/?tab=doc#/doc/?type=model&url=https%3A%2F%2Fhelp.aliyun.com%2Fdocument_detail%2F2667824.html&renderType=iframe


## 常见问题  
1. 常见报错： 16:26:22.466 ‌error: app-service.js(4737:38) ReferenceError:Can't find variable: TextDecoder parseChunkData@app-service.js:4737:38‌

答：需要打自定义基座


## 交流群  
更多问题欢迎[点此](https://im.dcloud.net.cn/#/?joinGroup=xxx)加入uni-ai官方交流群
