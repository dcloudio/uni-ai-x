<template>
	<view class="uni-table-th" :class="{'th-table--border':isBorder}" :style="{ width: customWidth + 'px', 'justify-content': customAlign }">
		<slot></slot>
	</view>
</template>

<script>
	import { $dispatch } from '../common/utils.uts'
	/**
	 * Th 表头
	 * @description 表格内的表头单元格组件
	 * @property {Number} 	width	单元格宽度，默认120px ，类型 number
	 * @property {Number} 	align = [left|center|right]	单元格对齐方式，默认center ，类型 string
	 * @tutorial https://ext.dcloud.net.cn/plugin?id=
	 */
	export default {
		name: 'uniTh',
		props: {
			width: {
				type: Number,
				default: 120
			},
			align: {
				type: String,
				default: 'center'
			}
		},
		data() {
			return {
				border: false,
				ascending: false,
				descending: false,
				isBorder: true
			}
		},
		computed: {
			customWidth() {
				return this.width
			},
			customAlign() {
				let alignStr: string;
				if (this.align == 'left') {
					alignStr = 'flex-start'
				} else if (this.align == 'right') {
					alignStr = 'flex-end'
				} else {
					alignStr = 'center'
				}
				return alignStr
			}
		},
		created() {
			$dispatch(this, 'uniTr', 'th_init', this)
		},
		methods: {}

	}
</script>

<style lang="scss" scoped>
	$border-color: #ebeef5;
	$uni-primary: #007aff !default;

	.uni-table-th {
		display: flex;
		flex-direction: row;
		align-items: center;
		flex-shrink: 0;
		padding: 12px 10px;
		border: none;
		border-bottom: 1px $border-color solid;
		min-width: 80px;
	}

	.uni-table-th-row {
		display: flex;
		flex-direction: row;
	}

	.th-table--border {
		border-left: 1px $border-color solid;
	}

	.uni-table-th-content {
		display: flex;
		align-items: center;
		flex: 1;
	}
</style>