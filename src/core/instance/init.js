/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  // 负责 Vue 的初始化过程
  Vue.prototype._init = function (options?: Object) {
    // 每一个 vue 实例都有一个 _uid, 并且是一次递增的s
    const vm: Component = this
    // a uid
    vm._uid = uid++

    let startTag, endTag
    // 性能度量，开始初始化
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options
    // 处理组件配置项
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      /**
       * 每个子组件初始化时走这里，这里只做了一些性能优化
       * 将组件配置对象上的一些深层次属性放到 vm.$options 选项中，以提高代码的执行效率
       */
      initInternalComponent(vm, options)
    } else {
       /**
       * 初始化根组件时走这里，合并 Vue 的全局配置到根组件的局部配置，比如 Vue.component 注册的全局组件会合并到 根实例的 components 选项中
       * 选项合并则发生在三个地方：
       *   1、Vue.component(CompName, Comp), 做了选项合并，合并 Vue 内置的全局组件和用户自己注册的全局组件，最终都会放到全局 components。 方法注册的全局组件在注册时做了选项合并
       *   2、{ components: { xx } } 方式注册的局部组件在执行编译器生成的 render 函数时做了选项合并， 会合并全局配置项到局部配置项中， 包括根组件中的 components 配置
       */
      // 3. 根组件走这里，只做了一件事情选项合并，将全局配置选项合并到根组件的局部配置
      // console.log('vm.constructor', vm.constructor)
      // console.log('vm.constructor', vm.constructor.super)
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
       // 设置代理，将 vm 实例上的属性代理到 vm._renderProxy
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    // 初始化组件实例关系属性，比如 $parent、$children、$root、$refs 等
    initLifecycle(vm)
    /**
     * 初始化自定义事件，这里需要注意一点，所以我们在 <comp @click="handleClick" /> 上注册的事件，监听者不是父组件，
     * 而是子组件本身，也就是说事件的派发和监听者都是子组件本身，和父组件无关
     * this.$emit('click') this.$on('click', function handleClick() {})
     */
    initEvents(vm)
    // 初始化插槽，获取 this.$slots, 定义 this._c 即 createElement 方法， 平时使用的 h 函数
    initRender(vm)
    // 执行 beforecreate 生命周期函数
    callHook(vm, 'beforeCreate')
    // 初始化 inject 选项， 得到 result[key] = val 形式的配置对象，并做响应式处理
    initInjections(vm) // resolve injections before data/props
    // 响应式处理的核心，处理 props， methods， computed， data， watch， 等选项
    initState(vm)
    // 处理 provide 选项
    // 总结 provide， inject 的原理
    // 通常说是 注入，实际不是，而是 inject 子组件去 祖代组件中寻找
    initProvide(vm) // resolve provide after data/props
    // 执行 created 生命周期
    callHook(vm, 'created')

    // 性能度量，结束初始化
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 如果存在 el 选项自动执行 $mount
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

// 性能优化， 打平配置对象上的属性，减少运行时原型链的查找， 提高执行效率
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 基于构造函数上的配置对象创建 vm.$options
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  // 打平配置对象上的属性，减少运行时原型链的查找
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  // 有 render 函数将其赋值到 vm.$options
  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// 从构造函数上解析配置项
export function resolveConstructorOptions (Ctor: Class<Component>) {
  // 从构造函数上获取选项
  let options = Ctor.options
  // console.log('Ctor.super', Ctor.super);
  // todo 什么时候有基类
  if (Ctor.super) { // 构造函数上有 super 属性，说明有基类
    const superOptions = resolveConstructorOptions(Ctor.super)
    // 缓存
    const cachedSuperOptions = Ctor.superOptions
    // 说明基类的配置发生了更改
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      // 找到更改的选项
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        // 将更改的选项和 extend 选项合并
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 将新的选项赋值给 options
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
