/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  // 总结： 本质就是执行插件暴露出来的 install 方法， 开始的时候会有判重防止注册同一个插件
  // Vue.use(plugin)
  Vue.use = function (plugin: Function | Object) {
    // Vue.use(VueRouter)
    // 不会重复注册一个组件
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // plugin.install(Vue)  插件的 第一个参数 都是 Vue
    const args = toArray(arguments, 1)
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      // plugin 是对象
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      // plugin 是函数
      plugin.apply(null, args)
    }
    // 将 plugin 放入已安装的插件数组中
    installedPlugins.push(plugin)
    return this
  }
}
