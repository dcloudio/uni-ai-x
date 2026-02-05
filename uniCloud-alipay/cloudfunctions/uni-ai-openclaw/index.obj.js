// 云对象教程: https://uniapp.dcloud.net.cn/uniCloud/cloud-obj
// jsdoc语法提示教程：https://ask.dcloud.net.cn/docs/#//ask.dcloud.net.cn/article/129

const ws = uniCloud.webSocketServer()
const db = uniCloud.database()
const socketCollection = db.collection('socket-id')

// 辅助函数：获取所有网关连接
async function getAllGateways() {
	const res = await socketCollection.where({
		type: 'gateway'
	}).get()
	return res.data || []
}

// 辅助函数：获取所有用户连接
async function getAllUsers() {
	const res = await socketCollection.where({
		type: 'user'
	}).get()
	return res.data || []
}

// 辅助函数：获取可用的网关
async function getAvailableGateway() {
	const gateways = await getAllGateways()
	if (gateways.length === 0) return null
	// 简单轮询，返回第一个网关
	return gateways[0].connection_id
}

// 处理用户发送的消息，广播给所有网关
async function handleUserMessage(userConnectionId, data) {
	const gateways = await getAllGateways()

	if (gateways.length === 0) {
		await ws.send(userConnectionId, {
			type: 'error',
			message: '没有可用的网关',
			timestamp: Date.now()
		})
		return
	}

	// 广播给所有网关
	for (const gateway of gateways) {
		await ws.send(gateway.connection_id, {
			type: 'user_message',
			fromConnectionId: userConnectionId,
			data: data,
			timestamp: Date.now()
		})
	}

	console.log('用户消息已广播给', gateways.length, '个网关')
}

// 处理网关发送的消息，必须发送给指定用户
async function handleGatewayMessage(gatewayConnectionId, data) {
	// 检查是否有指定接收者
	const toConnectionId = data.toConnectionId

	if (!toConnectionId) {
		console.error('网关消息缺少 toConnectionId，拒绝发送')
		await ws.send(gatewayConnectionId, {
			type: 'error',
			message: '消息缺少 toConnectionId，无法发送',
			timestamp: Date.now()
		})
		return
	}

	try {
		await ws.send(toConnectionId, {
			type: 'gateway_message',
			from: 'openclaw',
			data: data,
			timestamp: Date.now()
		})
		// console.log('网关消息已发送给用户', toConnectionId)
	} catch (err) {
		console.error('发送给用户失败:', toConnectionId, err)
		// 通知网关发送失败
		await ws.send(gatewayConnectionId, {
			type: 'error',
			message: `发送给用户 ${toConnectionId} 失败: ${err.message}`,
			timestamp: Date.now()
		})
	}
}

module.exports = {
	_before: function () { // 通用预处理器
	},

	/**
	 * 生成 WebSocket 连接地址
	 * @param {Object} query 连接参数
	 * @returns {Object} 包含 WebSocket URL 的对象
	 */
	async getWebSocketURL(query = {}) {
		try {
			// 生成签名的 WebSocket URL
			const wsUrl = await ws.signedURL('uni-ai-openclaw', query)

			const result = {
				errCode: 0,
				errMsg: '生成成功',
				url: wsUrl
			}

			// 支持 JSONP
			const callback = this.getHttpInfo().headers['x-dcloud-request-query']?.callback
			if (callback) {
				// 返回 JSONP 格式
				return `${callback}(${JSON.stringify(result)})`
			}

			return result
		} catch (error) {
			console.error('生成 WebSocket URL 失败:', error)
			const result = {
				errCode: -1,
				errMsg: error.message || '生成失败'
			}

			const callback = this.getHttpInfo().headers['x-dcloud-request-query']?.callback
			if (callback) {
				return `${callback}(${JSON.stringify(result)})`
			}

			return result
		}
	},

	/**
	 * WebSocket 连接事件
	 * 当客户端建立连接时触发
	 */
	async _onWebsocketConnection(event) {
		const { connectionId, query } = event
		const { type, clientId } = query || {}

		console.log('客户端连接:', connectionId, 'type:', type, 'clientId:', clientId)

		try {
			const connectionType = type === 'openclaw' ? 'gateway' : 'user'

			// 如果提供了 clientId，检查是否有旧连接需要断开
			if (clientId) {
				// 查找相同 clientId 和类型的旧连接
				const oldConnections = await socketCollection.where({
					client_id: clientId,
					type: connectionType
				}).get()

				// 断开并删除旧连接
				for (const oldConn of oldConnections.data) {
					if (oldConn.connection_id !== connectionId) {
						console.log('检测到重复连接，断开旧连接:', oldConn.connection_id)
						ws.close(oldConn.connection_id).catch(err => {
							console.error('断开旧连接失败:', err)
						})
						// 从数据库删除旧连接记录
						await socketCollection.doc(oldConn._id).remove()
					}
				}
			}

			// 将新连接信息存储到数据库
			await socketCollection.add({
				connection_id: connectionId,
				client_id: clientId || '',
				type: connectionType,
				connected_at: Date.now()
			})

			if (type === 'openclaw') {
				// OpenClaw 网关连接
				ws.send(connectionId, {
					type: 'welcome',
					role: 'gateway',
					message: 'OpenClaw 网关连接成功',
					connectionId: connectionId,
					timestamp: Date.now()
				}).catch(err => {
					console.error('发送网关欢迎消息失败:', err)
				})

				const gateways = await getAllGateways()
				console.log('网关已连接，当前网关数:', gateways.length)
			} else {
				// 普通用户连接
				const gatewayId = await getAvailableGateway()

				ws.send(connectionId, {
					type: 'welcome',
					role: 'user',
					message: '欢迎连接到 OpenClaw 服务',
					connectionId: connectionId,
					hasGateway: !!gatewayId,
					timestamp: Date.now()
				}).catch(err => {
					console.error('发送用户欢迎消息失败:', err)
				})

				const users = await getAllUsers()
				console.log('用户已连接，当前用户数:', users.length)
			}
		} catch (error) {
			console.error('连接处理错误:', error)
		}
	},

	/**
	 * WebSocket 消息事件
	 * 实现用户和网关之间的消息转发
	 */
	async _onWebsocketMessage(event) {
		const { connectionId, payload } = event
		console.log('收到消息:', connectionId, '内容:', payload)

		// 解析客户端发送的数据
		let receivedData
		try {
			receivedData = typeof payload === 'string' ? JSON.parse(payload) : payload
		} catch (e) {
			receivedData = payload
		}

		// 从数据库查询连接信息
		const connResult = await socketCollection.where({
			connection_id: connectionId
		}).get()

		if (connResult.data.length === 0) {
			// 未知连接
			await ws.send(connectionId, {
				type: 'error',
				message: '未识别的连接',
				timestamp: Date.now()
			})
			return
		}

		const connection = connResult.data[0]

		if (connection.type === 'gateway') {
			// 网关发送的消息，转发给所有用户
			await handleGatewayMessage(connectionId, receivedData)
		} else if (connection.type === 'user') {
			// 用户发送的消息，转发给所有网关
			await handleUserMessage(connectionId, receivedData)
		}
	},

	/**
	 * WebSocket 断开连接事件
	 * 当客户端断开连接时触发
	 */
	async _onWebsocketDisConnection(event) {
		const { connectionId } = event
		console.log('客户端断开连接:', connectionId)

		try {
			// 从数据库查询连接信息
			const connResult = await socketCollection.where({
				connection_id: connectionId
			}).get()

			if (connResult.data.length > 0) {
				const connection = connResult.data[0]

				// 从数据库删除连接记录
				await socketCollection.doc(connection._id).remove()

				if (connection.type === 'gateway') {
					const gateways = await getAllGateways()
					console.log('网关已断开，当前网关数:', gateways.length)
				} else {
					const users = await getAllUsers()
					console.log('用户已断开，当前用户数:', users.length)
				}
			}
		} catch (error) {
			console.error('断开连接处理错误:', error)
		}
	},

	/**
	 * WebSocket 错误事件
	 * 当其他事件处理出错时触发
	 */
	async _onWebsocketError(event) {
		const { connectionId, message } = event
		console.error('WebSocket 错误:', connectionId, message)
	}
}
