import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// Vue 构造函数
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 调用 Vue.prototype._init 方法， 该方法是在 initMixin 函数中定义的
  this._init(options)
}

initMixin(Vue)
/**
 * $data $props $set $del $watch 
 */
stateMixin(Vue)
/**
 * $on $emit $once $off
 */
eventsMixin(Vue)
/**
 * _update $destory $forceUpdate
 */
lifecycleMixin(Vue)
/**
 * renderHelper $nextTick _render
 */
renderMixin(Vue)

export default Vue
