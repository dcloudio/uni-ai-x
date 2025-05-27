# uni-table for uni-app x
基于 `uni-app x` 的基础表格组件，当前版本只实现了基础的数据展示功能 

## 基础说明
表格组件由多个组件构成 ,整体与web table 结构一致 ，但功能略有区别

| 属性名 |  说明 |
| - | - | 
| uni-table | 表格所有组件的父级 |
| uni-tr | 表格行 ，uni-table 的直接子组件 |
| uni-th | 表格头单元格，uni-tr 的直接子组件 |
| uni-td | 内容单元格，uni-tr 的直接子组件 |
| *uni-thead | 表格头部组件 ，可以用于固定表头，或者对表头进行单独样式处理（暂不支持） |
| *uni-tbody | 表格主要内容组件，可以用于内容滚动，或者对整体内容进行单独样式处理（暂不支持） |

### uni-table 属性
| 属性名 | 类型 | 说明 |
| - | - | - |
| stripe | booblean | 斑马纹 |
| *height | number | 表格内容区域高度，超出显示竖向滚动条（暂不支持） |

### uni-th 属性
| 属性名 | 类型 | 说明 |
| - | - | - |
| width | number | 控制当前列的宽度，默认 120 ，单位 px |
| algin | string | 控制单元格对齐方式 ，可选 left、right、center，默认center |


> 暂时 uni-tr 、 uni-td 中没有任何属性 ，所有组件均无事件 ，目前只做样式显示 ,通过修改 th 的属性，来影响当前整列的宽度和对齐方式


### 示例


```html

<uni-table :stripe="true">
	<uni-tr>
		<uni-th :width="80" align="left">表头1</uni-th>
		<uni-th >表头2</uni-th>
		<uni-th :width="200">表头3</uni-th>
		<uni-th>表头4</uni-th>
		<uni-th>表头5</uni-th>
		<uni-th>表头6</uni-th>
		<uni-th>表头7</uni-th>
		<uni-th>表头8</uni-th>
	</uni-tr>
	<uni-tr>
		<uni-td>内容11</uni-td>
		<uni-td>内容12</uni-td>
		<uni-td>内容13</uni-td>
		<uni-td>内容14</uni-td>
		<uni-td>内容15</uni-td>
		<uni-td>内容16</uni-td>
		<uni-td>内容17</uni-td>
		<uni-td>内容18</uni-td>
	</uni-tr>
	<uni-tr v-for="item in 30">
		<uni-td>内容11 {{item}}</uni-td>
		<uni-td>内容12 {{item}}</uni-td>
		<uni-td>内容13 {{item}}</uni-td>
		<uni-td>内容14 {{item}}</uni-td>
		<uni-td>内容15 {{item}}</uni-td>
		<uni-td>内容16 {{item}}</uni-td>
		<uni-td>内容17 {{item}}</uni-td>
		<uni-td>内容18 {{item}}</uni-td>
	</uni-tr>
</uni-table>

```


### 补充说明 
1. 目前只实现了基础数据展示功能，可以控制单元格宽度和对齐方式，是否显示斑马纹
2. 未来版本会增加更多功能，如固定高度 ，固定列，合并单元格等高阶功能。同时会增加直接数据渲染方式：
   ```html
    <template>
      <uni-table :data="tableData" :column="column"></uni-table>
    </template>

    <script>
    export default {
      data() {
        return {
          title: 'Hello',
          tableData: [{
            name: '张三',
            age: 18,
            sex: '男',
          }, {
            name: '李四',
      			age: 20,
            sex: '女',
          }, {
            name: '王二',
            age: 41,
            sex: '男',
          }],
          column: [{
            dataKey: 'name',
            title: '姓名',
            width: 150,
          },{
            dataKey: 'age',
            title: '年龄',
            width: 100,
          },{
            dataKey: 'sex',
            title: '性别',
            width: 80,
          }]
        }
      },
      onLoad() {},
      methods: {}
    }
      

    </script>
   
    ```
	> 数据渲染的方式 ，可以减少组件使用难度，但是带来的缺点则是框架限制下的自定义功能，如自定义单元格内容等
