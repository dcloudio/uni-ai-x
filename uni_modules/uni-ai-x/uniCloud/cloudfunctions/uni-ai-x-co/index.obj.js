const createConfig = require("uni-config-center");
const config = createConfig({pluginId: "uni-ai-x"}).config();
// 引入uniCloud.database()方法，并创建db对象
const db = uniCloud.database();
const dbCmd = db.command;
// 创建userscollection对象
const userscollection = db.collection('uni-id-users')
// 引入uni-id-common模块
const uniIdCommon = require('uni-id-common')
module.exports = {
	_before: async function () { // 通用预处理器	
		/*先校验token（用户身份令牌）是否有效，并获得用户的_id*/
		// 获取客户端信息
		this.clientInfo = this.getClientInfo()
		// console.log(this.clientInfo);
		// 定义uni-id公共模块对象
		this.uniIdCommon = uniIdCommon.createInstance({
			clientInfo: this.clientInfo
		})
		// 校验token（用户身份令牌）是否有效，并获得用户的_id
		let res = await this.uniIdCommon.checkToken(this.clientInfo.uniIdToken)
		if (res.errCode) {
			// 如果token校验出错，则抛出错误
			throw res
		} else {
			// 通过token校验则，拿去用户id
			this.current_uid = res.uid
		}
		
		if(!res.role.includes('dcloud-staff')){
			const useCountCollection = db.collection('ai-chat-use-count')
			//  非官方账号根据使用次数限制
			let {data:[useCount]} = await useCountCollection
								.where({"user_id":this.current_uid})
								.field({
									"count":1,
									"day_count":1,
									"cycle_count":1,
									"update_time":1,
									"cycle_time":1
								})
								.limit(1)
								.get()
			// console.log('useCount',useCount);
			if(useCount){
				let {
					// 总次数
					count,
					// 最后一天使用的总次数
					day_count,
					// 本周期总次数
					cycle_count,
					// 最新一次更新的时间戳
					update_time,
					// 本周期开始的时间戳（这里定义一个周期是30天）
					cycle_time
				} = useCount
				// console.log('count',{count,update_time});
				
				const maxCycleCount = 20; // 限制月天最多5次
				const maxDayCount = 5; // 限制每天最多5次
				
				let updateObj = {
					"count":dbCmd.inc(1),
					"update_time":Date.now()
				};
				
				console.error('getDistanceDay(cycle_time)',getDistanceDay(cycle_time));
				
				// 1. 先判断:cycle_time是否在30天内
				if(getDistanceDay(cycle_time) <= 30){
					// 判断是否超过使用次数
					if(cycle_count < maxCycleCount){
						updateObj.cycle_count = dbCmd.inc(1)
					}else{
						throw new Error("示例项目，每个账户每月仅限使用20次；") 
					}
				}else{
					// cycle_count 变成1（清零，+1）
					updateObj.cycle_count = 1;
					// cycle_time  赋值为当前
					updateObj.cycle_time = Date.now()
				}
				// 2. 判断update_time是不是在当天
				if(getDistanceDay(update_time) === 0){
					// 判断是否超过使用次数
					if(day_count < maxDayCount){
						updateObj.day_count = dbCmd.inc(1)
					}else{
						throw new Error("示例项目，每个账户每天仅限使用5次；")
					}
				}else{
					updateObj.day_count = 1
					updateObj.update_time = Date.now()
				}
				let res = await useCountCollection
								.where({"user_id":this.current_uid})
								.update(updateObj)
				// console.error('1updateCount',res);
			}else{
				let data = {
					"user_id":this.current_uid,
					// 总次数
					"count":1,
					// 最后一天使用的总次数
					"day_count":1,
					// 本周期总次数
					"cycle_count":1,
					// 创建时间
					"create_time":Date.now(),
					// 最新一次更新的时间戳
					"update_time":Date.now(),
					// 本周期开始的时间戳（这里定义一个周期是30天）
					"cycle_time":Date.now()
				}
				let res = await useCountCollection.add(data)
				// console.log('updateCount',res);
			}
		}
		
		
		if (this.getMethodName() == 'getBailianTmpToken') {
			
			// 获取需要销毁的积分值
			const spentScore = config.spentScore ?? 0
			if (spentScore > 0){
				/* 判断剩余多少积分：拒绝对话、扣除配置的积分数 */
				let {
					data: [{
						score
					}]
				} = await userscollection.doc(this.current_uid).field({
					'score': 1
				}).get()
				// 如果积分余额小于与uni-ai对话一次所需消耗的积分数 即 积分不足 则抛出错误提醒客户端
				if (score < spentScore) {
					throw "insufficientScore"
				}
				// 扣除对应的积分值
				await userscollection.doc(this.current_uid)
					.update({
						score: db.command.inc(-1 * spentScore)
					})
			}
			
		}
	},
	async _after(error, result) {
		// 如果有错误
		if (error) {
			if (error.errCode && error.errMsg) {
				return error
			}
			// 如果是积分不足错误
			else if (error == 'insufficientScore') {
				// 设置回复内容
				return {
					"errMsg": "积分不足，请联系管理员",
					"errCode": "uni-ai-x-co-insufficientScore"
				}
			} else {
				// 如果是其他错误
				throw error // 直接抛出异常
			}
		}
		return result
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

/**
 * 传入时间戳，获得距离当前有几天
 * @param {timestamp} 时间戳
 */
function getDistanceDay(timestamp){
  const nowDate = new Date();
  const date2 = new Date(timestamp);
  return (nowDate.getFullYear() - date2.getFullYear()) * 365 +
        (nowDate.getMonth() - date2.getMonth()) * 30 +
        nowDate.getDate() - date2.getDate()
}