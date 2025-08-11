<template>
	<view class="uni-table-td" :class="{'td-table--border':isBorder}" :style="{width:customWidth + 'px','justify-content':customAlign}">
		<text class="uni-table-text">
			<slot></slot> 
		</text>
	</view>
</template>

<script>
	import { $dispatch } from '../common/utils.uts'
	/**
	 * Td 单元格
	 * @description 表格中的标准单元格组件
	 * @tutorial https://ext.dcloud.net.cn/plugin?id=
	 */
	export default {
		name: 'uniTd',
		props: {
			width: {
				type: [String, Number],
				default: ''
			},
			align: {
				type: String,
				default: 'center'
			},
			rowspan: {
				type: [Number, String],
				default: 1
			},
			colspan: {
				type: [Number, String],
				default: 1
			}
		},
		data() {
			return {
				customWidth: 120,
				customAlign: 'center',
				isBorder: true
			};
		},
		created() {
			$dispatch(this, 'uniTr', 'td_init', this)
		},
		methods: {}
	}
</script>

<style lang="scss" scoped>
	$border-color: #EBEEF5;

	.uni-table-td {
		display: flex;
		flex-direction: row;
		align-items: center;
		padding: 8px 10px;
		border: none;
		border-bottom: 1px $border-color solid;
		// color: #606266;
		min-width: 80px;
	}

	.td-table--border {
		border-left: 1px $border-color solid;
	}
</style>