<template>
	<view class="uni-table-tr" :class="{'table--stripe':isStripe}">
		<slot></slot>
	</view>
</template>

<script>
	import { $dispatch } from '../common/utils.uts'
	/**
	 * Tr 表格行组件
	 * @description 表格行组件 仅包含 th,td 组件
	 * @tutorial https://ext.dcloud.net.cn/plugin?id=
	 */
	export default {
		name: 'uniTr',
		props: {
			disabled: {
				type: Boolean,
				default: false
			},
			keyValue: {
				type: [String, Number],
				default: ''
			}
		},
		options: {
			// #ifdef MP-TOUTIAO
			virtualHost: false,
			// #endif
			// #ifndef MP-TOUTIAO
			virtualHost: true
			// #endif
		},
		data() {
			return {
				value: false,
				border: false,
				selection: false,
				th_child_nodes: [] as Array < ComponentPublicInstance > ,
				ishead: true,
				checked: false,
				indeterminate: false,
				th_index: 0,
				td_index: 0,
				isStripe: false
			}
		},
		created() {
			$dispatch(this, 'uniTable', 'tr_init', this)
		},
		methods: {
			th_init(child: ComponentPublicInstance) {
				$dispatch(this, 'uniTable', 'th_init', child, this.th_index)
				this.th_index++
			},
			td_init(child: ComponentPublicInstance) {
				$dispatch(this, 'uniTable', 'td_init', child, this.td_index)
				this.td_index++
			}
		}
	}
</script>

<style lang="scss">
	$border-color: #ebeef5;

	.uni-table-tr {
		display: flex;
		flex-direction: row;
	}

	.tr-table--border {
		border-right: 1px $border-color solid;
	}

	.table--stripe {
		background-color: #fafafa;

	}
</style>