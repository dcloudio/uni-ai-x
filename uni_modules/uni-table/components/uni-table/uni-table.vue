<template>
	<view class="uni-table-scroll table--border" :style="{width:autoTableWidth}">
		<scroll-view id="table" direction="horizontal">
			<view class="uni-table" :class="{ 'table--stripe': stripe }" :style="{width:tableWidth+'px'}">
				<uni-tr>
					<template v-for="(column ,index) in columns" :key="index">
						<uni-th :width="column['width'] !=null?column['width']:120" :align="column['width'] != null?column['align']:'center'">
							<text style="font-weight: bold;">{{column['title']}}</text>
						</uni-th>
					</template>
				</uni-tr>
				<scroll-view id="scroll" :style="{height:tableHeight>0?tableHeight+'px':'auto'}" @scroll="onScroll" @scrolltolower="onScrollToLower">
					<template v-for="(item ,index) in list" :key="index">
						<uni-tr>
							<template v-for="(column ,idx) in columns" :key="idx">
								<uni-td>
									<template v-if="column['dataKey'] != null">
										<slot :name="(column['dataKey'] as string)" :column="item" :rowIndex="index" :columnIndex="idx">{{item[column['dataKey'] as string]}}</slot>
									</template>
								</uni-td>
							</template>
						</uni-tr>
					</template>
				</scroll-view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
	type Item = {
		id: number
		name: string
		info: string
	}

	type ColumnType = {
		key: any
		dataKey: string
		align ? : string
		width ? : string
		title: string
	}

	class Jobs {
		private jobs: (() => Promise < void > )[] = [];
		paused: boolean = true;
		constructor() {}
		add(job: () => Promise < void > ) {
			this.jobs.push(job);
		}
		pause() {
			this.paused = true;
		}
		private execute() {
			if (this.paused) {
				return;
			}
			if (this.jobs.length == 0) {
				this.paused = true
				return;
			}
			const job = this.jobs.shift();
			if (job != null) {
				job().then(() => {
					this.execute();
				});
			}
		}
		resume() {
			if (!this.paused) {
				return
			}
			this.paused = false;
			setTimeout(() => {
				this.execute();
			}, 0)
		}
		reset() {
			this.jobs = [];
			this.paused = true;
		}
		get done(): boolean {
			return this.jobs.length == 0;
		}
	}

	function delay(time: number): Promise < void > {
		return new Promise(resolve => {
			setTimeout(() => {
				resolve()
			}, time)
		})
	}

	/**
	 * Table 表格
	 * @description 用于展示多条结构类似的数据的基础表格
	 * @tutorial https://ext.dcloud.net.cn/plugin?id=
	 * @property {Boolean} 	stripe 				是否显示斑马线
	 */
	export default {
		name: 'uniTable',
		options: {
			virtualHost: true
		},
		emits: ['selection-change'],
		props: {
			columns: {
				type: Array as PropType < UTSJSONObject[] > ,
				default: [] as UTSJSONObject[]
			},
			data: {
				type: Array as PropType < UTSJSONObject[] > ,
				default: [] as UTSJSONObject[]
			},
			height: {
				type: Number,
				default: 0
			},
			// 是否显示斑马线
			stripe: {
				type: Boolean,
				default: true
			}
		},
		data() {
			return {
				// data: [] as UTSJSONObject[],
				list: [] as UTSJSONObject[],
				jobs: new Jobs(),
				batchSize: 100,
				scrolling: false,
				refresherTriggered: false,
				scrollendTimeout: -1,
				pulling: false,
				minWidth: 0,
				tableWidth: 0,
				child_nodes: [] as Array < UniThComponentPublicInstance > ,
				tr_index: 0,
				isTip: false,
				tableHeight: 0,
				tWidth: 0
			}
		},
		watch: {
			columns: {
				handler(newVal, oldVal) {
					this.init(false, 'columns')
				},
				deep: true // 深度监听
			},
			data: {
				handler(newVal, oldVal) {
					// 使用diff算法只更新差异部分
					this.updateDataWithDiff(newVal, oldVal)
				},
				deep: true // 深度监听
			}
		},
		computed: {
			autoTableWidth() {

				if (this.tWidth == 0) {
					return 'auto'
				}

				if (this.tWidth > this.tableWidth) {
					return this.tableWidth + 2 + 'px'
				} else {
					return this.tWidth + "px"
				}
			}
		},
		created() {},
		mounted() {
			this.init();
		},
		methods: {
			/**
			 * 数据差异比较
			 * @description 比较新旧数据，只更新差异部分，避免重复渲染
			 * @param {UTSJSONObject[]} newData 新数据数组
			 * @param {UTSJSONObject[]} oldData 旧数据数组
			 */
			updateDataWithDiff(newData: UTSJSONObject[], oldData: UTSJSONObject[]) {
				// 如果新数据为空，清空列表
				if (newData.length == 0) {
					this.list = []
					return
				}

				// 如果旧数据为空或当前列表为空，直接设置新数据
				if (oldData.length == 0 || this.list.length == 0) {
					this.list = [...newData]
					return
				}

				// 计算差异并只添加新增的数据
				const diffItems = this.getDiffItems(newData, this.list)
				if (diffItems.length > 0) {
					// 使用Vue的响应式更新，只添加新数据
					this.list.push(...diffItems)
				}
			},

			/**
			 * 获取数据差异
			 * @description 比较两个数组，返回新数组中不存在于旧数组的项
			 * @param {UTSJSONObject[]} newArray 新数组
			 * @param {UTSJSONObject[]} existingArray 已存在的数组
			 * @returns {UTSJSONObject[]} 差异项数组
			 */
			getDiffItems(newArray: UTSJSONObject[], existingArray: UTSJSONObject[]): UTSJSONObject[] {
				// 如果新数组长度小于等于已存在数组，说明没有新增数据
				if (newArray.length <= existingArray.length) {
					return []
				}

				// 简单的diff算法：假设新数据是在原数据基础上追加的
				// 返回新数组中超出已存在数组长度的部分
				return newArray.slice(existingArray.length)
			},

			init(autoResumeJobs: boolean = true, source: 'data' | 'columns' = 'data') {

				// 仅当 data 变化时使用diff更新，不再直接清空
				if (source === 'data') {
					// 注意：这里不再清空list，而是通过watch中的updateDataWithDiff处理
					this.jobs.reset()
				}

				// TODO 仅当 columns 变化时清空 child_nodes，重新收集 ,暂时还有问题，影响未知
				// if (source === 'columns') {
				// 	this.child_nodes = []
				// }

				this.tableHeight = 0
				this.tWidth = 0
				this.tableWidth = 0

				if (source === 'data') {
					// 将数据分批放入任务队列
					const batchCount = Math.ceil(this.data.length / this.batchSize);
					for (let i = 0; i < batchCount; i++) {
						const start = i * this.batchSize;
						const end = Math.min(start + this.batchSize, this.data.length);
						this.jobs.add(async () => {
							const batchData = this.data.slice(start, end);
							this.list.push(...batchData);
							// 两批数据之间增加延迟，防止卡顿时间太久
							await this.$nextTick();
							await delay(100)
						});
					}
					if (autoResumeJobs) {
						this.jobs.resume();
					}
				}
				this.$nextTick(() => {
					uni.createSelectorQuery().in(this).select('#scroll').boundingClientRect().exec((ret) => {
						if (ret.length == 0) return
						const data = ret[0] as NodeInfo
						const height = data.height!;

						if (this.height != 0 && this.height <= height) {
							this.tableHeight = this.height
						} else {
							this.tableHeight = 0
						}
					})
					uni.createSelectorQuery().in(this).select('#table').boundingClientRect().exec((ret) => {
						if (ret.length == 0) return
						const data = ret[0] as NodeInfo
						const width = data.width!
							this.tWidth = width
					})

					let totalWidth = 0

					this.child_nodes.forEach((child: UniThComponentPublicInstance, index: number) => {
						const width = child.customWidth as number
						totalWidth += width
					})
					this.tableWidth += totalWidth
				})
			},
			onScroll() {
				// 部分平台不支持scrollend事件，使用定时器模拟
				clearTimeout(this.scrollendTimeout)
				this.scrollendTimeout = setTimeout(() => {
					this.onScrollEnd()
				}, 100)
				if (this.scrolling) {
					return;
				}
				this.scrolling = true;
				// 滚动期间暂停分批加载，保证滚动流畅度
				this.jobs.pause();
			},
			onScrollEnd() {
				this.scrolling = false;
				// 滚动结束，继续执行分批加载逻辑
				this.jobs.resume();
			},
			onScrollToLower() {
				// 分批加载进行中，暂不执行滚动到底部加载更多数据的逻辑
				if (!this.jobs.done) {
					return;
				}
				// 加载更多数据
			},


			tr_init(child: UniTrComponentPublicInstance) {
				if (this.tr_index % 2 == 0 && this.tr_index != 0) {
					child.$data['isStripe'] = this.stripe
				}

				this.tr_index++
			},
			th_init(child: UniThComponentPublicInstance, index: number) {
				this.child_nodes.push(child)
				if (index == 0) {
					child.isBorder = false
				}
			},
			td_init(child: UniTdComponentPublicInstance, index: number) {
				if (this.isTip) return
				if (this.child_nodes.length == 0) {
					console.error('请检查是否含有表头');
					this.isTip = true
					return
				}
				try {
					const thInstance = this.child_nodes[index]
					const width = thInstance.customWidth as number
					const align = thInstance.customAlign as string
					child.customWidth = width
					child.customAlign = align
				} catch (error) {
					console.log('error');
				}

				if (index == 0) {
					child.isBorder = false
				}
			}
		}
	}
</script>

<style lang="scss" scope>
	$border-color: #ebeef5;

	.uni-table-scroll {
		width: 100%;
	}

	.uni-table {
		position: relative;
		background-color: #fff;
	}

	.table--border {
		border: 1px $border-color solid;
	}
</style>