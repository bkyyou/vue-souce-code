/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// patch 期间， 在组件的 vnode 上调用内联钩子
// inline hooks to be invoked on component VNodes during patch
const componentVNodeHooks = {
  // 在 patch 阶段被调用
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    // debugger
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // 当组件被 keep-alive 包裹时， 走这
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // 非 keep-live, 或者子组件初始化时， 走这
      // 实例化子组件
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      )
      // 执行自组价 $mount , 进入挂载阶段， 接下来就是通过编译得到 render 函数， 
      // 接着走挂载 patch 这条路， 直到组件渲染到页面
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    // 用新的 VNode 更新 老 的 VNode 上的属性
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  /**
   * 销毁组件
   * 1. 如果组件被 keep-live 包裹， 则使组件失活， 不销毁组件实例， 从而缓存组件状态
   * 2. 如果组件没有被 keep-live 包裹， 直接调用实例的 $destroy 方法销毁组件
   */
  destroy (vnode: MountedComponentVNode) {
    // 从 vnode 上获取组价实例 
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      // 如果组件没有被销毁
      if (!vnode.data.keepAlive) {
        // 组件销毁， 组件没有被 keep-live 包裹， 直接调用 $destroy 方法销毁组件
        componentInstance.$destroy()
      } else {
        // 负责让组件失活， 不销毁组件实例，从而缓存组件的状态
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)

/**
 * 
 * @param {组件的构造函数} Ctor 
 * @param {属性对象} data 
 * @param {上下文} context 
 * @param {子节点} children 
 * @param {标签名} tag 
 * @returns 
 */
export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  // 如果构造函数不存在，直接 return
  if (isUndef(Ctor)) {
    return
  }
  // debugger
  // Vue.extend 之类的方法
  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  // 如果 Ctor 是组件的配置对象，则通过 Vue.extend(options) 将其转换为组件的构造函数
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  // 到这个阶段如果 Ctor 还不是函数， 则报错，表明当前组件定义有问题
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  // 处理异步组件
  let asyncFactory
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor)
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 子组件做选项合并的地方，编译器将组件编译为渲染函数，渲染时执行 render 函数, 然后执行其中的下划线 _c, 就会走到这里， 然后做选项合并
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  // 将组件的 v-model 的信息 （值和回调函数） 转换为 data.attrs 对象上的属性， 值 和 data.on 对象上的事件名和回调
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // 提取 props 配置， 
  // extract props
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // 处理函数式组件， 通过执行其 render 函数生成 vnode
  // functional component
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // 获取事件监听对象
  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  const listeners = data.on
  // 将 有 .native 修饰符的事件对象赋值到 data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // 走到这个位置，说明当前组件是一个普通的自定义组件（不是函数式组件）， 在 data.hook 上安装了一些内置的钩子
  // init prepatch insert destroy 这些方法都会在 patch 阶段调用
  // install component management hooks onto the placeholder node
  installComponentHooks(data)

  // return a placeholder vnode
  // 实例化 VNode 并返回 组件 的 VNode
  const name = Ctor.options.name || tag
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

export function createComponentInstanceForVnode (
  // we know it's MountedComponentVNode but flow doesn't
  vnode: any,
  // activeInstance in lifecycle state
  parent: any
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode,
    parent
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // new 组件构造函数（），得到组件实例
  return new vnode.componentOptions.Ctor(options)
}

function installComponentHooks (data: VNodeData) {
  // 定义 data.hook 对象
  const hooks = data.hook || (data.hook = {})
  // hookToMerge = ['init', 'prepatch', 'insert', 'destroy']
  for (let i = 0; i < hooksToMerge.length; i++) {
    // 获取 key， 比如 init
    const key = hooksToMerge[i]
    // 获取用户传递的 init 方法
    const existing = hooks[key]
    // 内置的 init 方法
    const toMerge = componentVNodeHooks[key]
    // 合并用户传递方法和内置方法
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
// 转换 v-modal， 得到 data.attrs[props] = val
// data.on[eventName] = [cb]
function transformModel (options, data: any) {
  // 处理属性值，在 data.atttrs[props] = data.modal.value
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  const existing = on[event]
  const callback = data.model.callback
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing)
    }
  } else {
    on[event] = callback
  }
}
