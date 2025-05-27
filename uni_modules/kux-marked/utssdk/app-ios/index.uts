/**
 * 引用 iOS 系统库，示例如下：
 * import { UIDevice } from "UIKit";
 * [可选实现，按需引入]
 */

/* 引入 interface.uts 文件中定义的变量 */
import { MyApiOptions, MyApiResult, MyApi, MyApiSync } from '../interface.uts';

/* 引入 unierror.uts 文件中定义的变量 */
import { MyApiFailImpl } from '../unierror';

/**
 * 引入三方库
 * [可选实现，按需引入]
 *
 * 在 iOS 平台引入三方库有以下两种方式：
 * 1、通过引入三方库framework 或者.a 等方式，需要将 .framework 放到 ./Frameworks 目录下，将.a 放到 ./Libs 目录下。更多信息[详见](https://uniapp.dcloud.net.cn/plugin/uts-plugin.html#ios-平台原生配置)
 * 2、通过 cocoaPods 方式引入，将要引入的 pod 信息配置到 config.json 文件下的 dependencies-pods 字段下。详细配置方式[详见](https://uniapp.dcloud.net.cn/plugin/uts-ios-cocoapods.html)
 *
 * 在通过上述任意方式依赖三方库后，使用时需要在文件中 import:
 * 示例：import { LottieLoopMode	} from 'Lottie'
 */

/**
 * UTSiOS 为平台内置对象，不需要 import 可直接调用其API，[详见](https://uniapp.dcloud.net.cn/uts/utsios.html)
 */

/**
 * 异步方法
 *
 * uni-app项目中（vue/nvue）调用示例：
 * 1、引入方法声明 import { myApi } from "@/uni_modules/uts-api"
 * 2、方法调用
 * myApi({
 *   paramA: false,
 *   complete: (res) => {
 *      console.log(res)
 *   }
 * });
 *
 */
export const myApi : MyApi = function (options : MyApiOptions) {

  if (options.paramA == true) {
    // 返回数据
    const res : MyApiResult = {
      fieldA: 85,
      fieldB: true,
      fieldC: 'some message'
    };
    options.success?.(res);
    options.complete?.(res);

  } else {
    // 返回错误
    let failResult = new MyApiFailImpl(9010001);
    options.fail?.(failResult)
    options.complete?.(failResult)
  }

}

/**
 * 同步方法
 *
 * uni-app项目中（vue/nvue）调用示例：
 * 1、引入方法声明 import { myApiSync } from "@/uni_modules/uts-api"
 * 2、方法调用
 * myApiSync(true);
 *
 */
export const myApiSync : MyApiSync = function (paramA : boolean) : MyApiResult {
  // 返回数据，根据插件功能获取实际的返回值
  const res : MyApiResult = {
    fieldA: 85,
    fieldB: paramA,
    fieldC: 'some message'
  };
  return res;
}

/**
 * 更多插件开发的信息详见：https://uniapp.dcloud.net.cn/plugin/uts-plugin.html
 */
