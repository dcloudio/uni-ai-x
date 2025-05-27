<template>
	<view class="uni-table-scroll table--border">
		<scroll-view id="table" direction="horizontal">
			<view class="uni-table" :class="{ 'table--stripe': stripe }" :style="{width:tableWidth+'px'}">
				<slot></slot>
			</view>
		</scroll-view>
	</view>
</template>

<script>
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
			// 是否显示斑马线
			stripe: {
				type: Boolean,
				default: true
			}
		},
		data() {
			return {
				minWidth: 0,
				tableWidth: 0,
				child_nodes: [] as Array < UniThComponentPublicInstance > ,
				tr_index: 0 ,
				isTip:false
			}
		},
		watch: {},
		created() {
			setTimeout(() => {
				this.child_nodes.forEach((child: UniThComponentPublicInstance, index: number) => {
					const width = child.customWidth as number
					this.tableWidth += width
				})
			}, 100)
		},
		mounted() {
			// uni.createSelectorQuery().in(this).select('#table').boundingClientRect().exec((ret) => {
			// 	console.log(ret);
			// 	const tableWidth = ret
			// })
		},
		methods: {
			tr_init(child: UniTrComponentPublicInstance) {
				if (this.tr_index % 2 == 0 && this.tr_index != 0) {
					child.$data['isStripe'] =this.stripe
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
				if(this.isTip) return
				if(this.child_nodes.length == 0 ) {
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
		border-bottom: none;
	}

	// .table--stripe {
	// 	/* #ifndef APP-NVUE */
	// 	::v-deep .uni-table-tr:nth-child(2n + 3) {
	// 		background-color: #fafafa;
	// 	}
	// 	/* #endif */
	// }
</style>