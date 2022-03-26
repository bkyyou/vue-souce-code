/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

export function initEvents (vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

function add (event, fn) {
  target.$on(event, fn)
}

function remove (event, fn) {
  target.$off(event, fn)
}

function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined
}

export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  // <comp @custom-click="handleClick" />
  // 将所有的事件和回调放到 vm._events 对象上 格式
  // {event1: [cb1, cb2, ...], ...}
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    // 事件为数组的情况
    // this.$on(['event1', 'event2', ...], () => {})
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        // 自调用
        vm.$on(event[i], fn)
      }
    } else {
      // 比如，如果存在 vm._event.['custom-click'] = [() => {}]
      // 这说明一个事件可以设置多个响应函数
      // this.$on('custom-click', cb1)
      // this.$on('custom-click', cb2)
      // vm._event.['custom-click'] = [cb1, cb2] 存在多个响应函数
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      /**
       * <comp @hook:mounted="handleHookMounted" />
       */
      if (hookRE.test(event)) {
        // 将 _hasHookEvent 置为 true ，标记当前组件实例存在 hook event
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  // 先通过 $on 添加事件， 将传进来的回调函数重写，先调用 $off 移除监听事件， 再执行用户传递进来的回调函数
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    // 将 用户 传进来的回调函数做了一层包装
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    // 将包装的函数作为事件的回调添加
    vm.$on(event, on)
    return vm
  }

  /**
   * 移除 vm._event 对象上指定事件 key 的指定回调函数
   * 1. 没有提供参数，将 vm._event = {}
   * 2. 提供第一个事件参数，表示 将 vm._event[event] = null
   * 3. 提供了两个参数，表示移除指定事件的指定回调函数
   * 
   * 一句话总结就是操作通过 $on 设置的 vm._events 对象
   */
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    // 移除所有的事件监听器
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    // 获取指定事件的回调函数
    const cbs = vm._events[event]
    if (!cbs) {
      return vm
    }
    if (!fn) {
      // 移除指定事件所有的回调函数
      vm._events[event] = null
      return vm
    }
    // specific handler
    // 移除指定事件的指定回调函数
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    // <comp @customClick="handleClick"></comp> html 不区分大小写 转换成 => <comp @customClick="handleClick"></comp>
    // 注册 $on('customClick', function() {}) js 触发 js是区分大小写的，所以会报下面的警告
    // <comp @customClick="handleClick"></comp>
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      //
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    // 从 vm._events 对象中获取指定的事件所有回调函数
    let cbs = vm._events[event]
    if (cbs) {
      // 数组转换，将类数据转为数组
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      for (let i = 0, l = cbs.length; i < l; i++) {
        // 执行回调函数，并做了异常处理
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
