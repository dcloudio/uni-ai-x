const createConfig = require("uni-config-center");
const config = createConfig({pluginId: "uni-ai-x"}).config();
module.exports = {
	_before: function () { // 通用预处理器

	},
	async getBailianTmpToken(){
		const llmManager = uniCloud.ai.getLLMManager({
			provider: 'aliyun-bailian',
			apiKey: config.apiKey.bailian
		})
		try {
			const res = await llmManager.getTempToken()
			return {
				errCode: 0,
				errMsg: 'success',
				data: {
					token: res.token,
					expiresAt: res.expiresAt
				}
			}
		} catch (error) {
			return {
				errCode: "uni-ai-x-co-getBailianTmpToken-error",
				errMsg: error.message,
				data: null
			}
		}
		
	}
}
