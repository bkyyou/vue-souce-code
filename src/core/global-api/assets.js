/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  // 初始化 Vue.component Vue.directive Vue.filter
  // 以 component 为例
  /**
   * Vue.component = function() {
   *  
   * }
   * 
   * 使用 Vue.component(CompName, Comp)
   */
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        if (type === 'component' && isPlainObject(definition)) {
          // 设置组件名称
          definition.name = definition.name || id
          // Vue.extend 方法, 基于 definition 去扩展一个新的组件子类， 直接 new definition 去实例化
          definition = this.options._base.extend(definition)
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 全局注册组件 this.options.components = {CompName: definition}
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
