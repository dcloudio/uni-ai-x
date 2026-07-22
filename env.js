// 参考文档: https://uniapp.dcloud.net.cn/worktile/auto/hbuilderx-extension/#envjs
// 备注：UNI_TEST_CUSTOM_ENV 用于自动化测试向uniapp-cli-vite编译器中传递一些环境变量，设置格式：key: value
module.exports = {
    "is-custom-runtime": false,
    "UNI_TEST_CUSTOM_ENV": {
        // 以下3个配置项用于定义以App-WebView方式运行的H5页面地址，方便自动化测试App-WebView场景
        // "UNI_AUTOMATOR_APP_WEBVIEW": "true",
        // "UNI_WEB_SERVICE_URL": "http://xxx.com/xxx.html",
        // "UNI_AUTOMATOR_APP_WEBVIEW_SRC": "http://xxx.com/xxx.html"
    },
    "compile": true,
    "h5": {
        "options": {
            "headless": false
        },
        "executablePath": ""
    },
    "mp-weixin": {
        "port": 9420,
        "account": "",
        "args": "",
        "cwd": "",
        "launch": true,
        "teardown": "disconnect",
        "remote": false,
        "executablePath": ""
    },
    "app-plus": {
        "android": {
            "id": "",
            "executablePath": ""
        },
        "version": "",
        "ios": {
            "id": "",
            "executablePath": ""
        },
        "uni-app-x": {
            "version": "",
            "android": {
                "id": "",
                "executablePath": "",
                "package": ""
            },
            "ios": {
                "id": "",
                "executablePath": "",
                "package": ""
            }
        }
    }
}
