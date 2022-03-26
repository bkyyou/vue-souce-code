/* @flow */

import { genHandlers } from './events'
import baseDirectives from '../directives/index'
import { camelize, no, extend } from 'shared/util'
import { baseWarn, pluckModuleFunction } from '../helpers'
import { emptySlotScopeToken } from '../parser/index'

type TransformFunction = (el: ASTElement, code: string) => string;
type DataGenFunction = (el: ASTElement) => string;
type DirectiveFunction = (el: ASTElement, dir: ASTDirective, warn: Function) => boolean;

export class CodegenState {
  options: CompilerOptions;
  warn: Function;
  transforms: Array<TransformFunction>;
  dataGenFns: Array<DataGenFunction>;
  directives: { [key: string]: DirectiveFunction };
  maybeComponent: (el: ASTElement) => boolean;
  onceId: number;
  staticRenderFns: Array<string>;
  pre: boolean;

  constructor (options: CompilerOptions) {
    this.options = options
    this.warn = options.warn || baseWarn
    this.transforms = pluckModuleFunction(options.modules, 'transformCode')
    this.dataGenFns = pluckModuleFunction(options.modules, 'genData')
    // baseDirectives 的方法， 在 src/platforms/web/compiler/directives
    // 处理指令 v-model v-html...  
    this.directives = extend(extend({}, baseDirectives), options.directives)
    const isReservedTag = options.isReservedTag || no
    this.maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)
    this.onceId = 0
    this.staticRenderFns = []
    this.pre = false
  }
}

export type CodegenResult = {
  render: string,
  staticRenderFns: Array<string>
};

/**
 * 
 * @param {*} ast ast 对象
 * @param {*} options 编译选项
 * @returns 
 */
export function generate (
  ast: ASTElement | void,
  // 编译选项
  options: CompilerOptions
): CodegenResult {
  // 实例化 CodegenState， 参数是编译选项， 最终得到的 state 大部分属性和 options 一样
  // state.staticRenderFns = []  state.directives
  const state = new CodegenState(options)
  // fix #11483, Root level <script> tags should not be rendered.
  // 调用 genElement , 得到最终的代码字符串
  const code = ast ? (ast.tag === 'script' ? 'null' : genElement(ast, state)) : '_c("div")'
  return {
    // 动态节点的渲染函数
    render: `with(this){return ${code}}`,
    // 存放所有静态节点的渲染函数的数组
    staticRenderFns: state.staticRenderFns
  }
}

// 返回
// 处理 ast 对象， 得到一个可执行函数的字符串形式， 比如 _c(tag, data, children, normalizationType)
export function genElement (el: ASTElement, state: CodegenState): string {
  if (el.parent) {
    el.pre = el.pre || el.parent.pre
  }

  if (el.staticRoot && !el.staticProcessed) {
    // _m(idx)
    // idx 是当前静态节点的渲染函数在 staticRenderFns 数组的下标
    return genStatic(el, state)
  } else if (el.once && !el.onceProcessed) {
    return genOnce(el, state)
  } else if (el.for && !el.forProcessed) {
    return genFor(el, state)
  } else if (el.if && !el.ifProcessed) {
    return genIf(el, state)
  } else if (el.tag === 'template' && !el.slotTarget && !state.pre) {
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') {
    return genSlot(el, state)
  } else {
    // component or element
    // 处理动态组件或普通元素，（自定义组件和平台保留标签，比如 web 平台的各个 html 标签）
    let code
    if (el.component) {
      // 动态组件部分
      code = genComponent(el.component, el, state)
    } else {
      // 入口
      let data
      if (!el.plain || (el.pre && state.maybeComponent(el))) {
        // 最终结果是一个 json 字符串
        data = genData(el, state)
      }
      // 生成当前节点所有子节点的渲染函数，格式为
      // '[_c(tag, data, children), ...], normalizationType'
      const children = el.inlineTemplate ? null : genChildren(el, state, true)
      // console.log('children', children);
      // code = _c(tag, data, children, normalizationType)  normalizationType: 节点的规范化类型， 是一个数字 0，1，2，4
      code = `_c('${el.tag}'${
        data ? `,${data}` : '' // data
      }${
        children ? `,${children}` : '' // children
      })`
    }
    // module transforms
    // 分别为 code 执行 transformNode 方法， 这部分暂时看起来没啥用， 暂时别看
    for (let i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code)
    }
    return code // 是可执行函数的字符串形式
  }
}

// 处理静态节点， 生成静态节点的渲染函数，将其放到 static.staticRenderFns 数组中。返回 _m(idx) 可执行函数
// hoist static sub-trees out
function genStatic (el: ASTElement, state: CodegenState): string {
  // 标记当前静态节点已经被处理了， 以免额外的递归
  el.staticProcessed = true
  // Some elements (templates) need to behave differently inside of a v-pre
  // node.  All pre nodes are static roots, so we can use this as a location to
  // wrap a state change and reset it upon exiting the pre node.
  const originalPreState = state.pre
  if (el.pre) {
    state.pre = el.pre
  }
  // 调用 genElement 方法得到静态节点的渲染函数， 保障成 `with(this){return _c(tag, data, children, normalizationType)}`
  state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`)
  state.pre = originalPreState
  // 返回一个可执行函数， _m(idx, true or '')
  return `_m(${
    state.staticRenderFns.length - 1
  }${
    el.staticInFor ? ',true' : ''
  })`
}

// v-once
function genOnce (el: ASTElement, state: CodegenState): string {
  el.onceProcessed = true
  // 如果节点上存在 if 指令，则走进 genif 方法
  if (el.if && !el.ifProcessed) {
    return genIf(el, state)
  } else if (el.staticInFor) {
    // 当前节点包裹在 v-for 指令节点的内部

    // 获取 v-for 所在节点的key
    let key = ''
    let parent = el.parent
    while (parent) {
      if (parent.for) {
        key = parent.key
        break
      }
      parent = parent.parent
    }
    if (!key) {
      process.env.NODE_ENV !== 'production' && state.warn(
        `v-once can only be used inside v-for that is keyed. `,
        el.rawAttrsMap['v-once']
      )
      return genElement(el, state)
    }
    // 返回结果： _o(_c(tag, data, children, normaliztionType), number, key)
    return `_o(${genElement(el, state)},${state.onceId++},${key})`
  } else {
    // 按照静态节点去处理
    return genStatic(el, state)
  }
}

export function genIf (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  // 标记
  el.ifProcessed = true // avoid recursion
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty)
}

/**
 * 处理 v-if 指令， 最终得到一个三元表达式： exp ? render1 : render2
 */
function genIfConditions (
  conditions: ASTIfConditions,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  // conditions 为空数组，则返回一个 _c(), 他会渲染一个空节点
  if (!conditions.length) {
    return altEmpty || '_e()'
  }

  // 拿出第一个元素 {exp, block}
  const condition = conditions.shift()
  if (condition.exp) {
    // 最终返回的是一个三元表达式 exp ? render1 : render2
    return `(${condition.exp})?${
      genTernaryExp(condition.block)
    }:${
      genIfConditions(conditions, state, altGen, altEmpty)
    }`
  } else {
    return `${genTernaryExp(condition.block)}`
  }

  // v-if with v-once should generate code like (a)?_m(0):_m(1)
  function genTernaryExp (el) {
    return altGen
      ? altGen(el, state)
      : el.once
        ? genOnce(el, state)
        : genElement(el, state)
  }
}

export function genFor (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altHelper?: string
): string {
  // 示例 v-for = "(item, idx) in arr"
  // exp = arr
  const exp = el.for
  // alias = 别名 item
  const alias = el.alias
  // idx
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : ''
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''

  if (process.env.NODE_ENV !== 'production' &&
    state.maybeComponent(el) &&
    el.tag !== 'slot' &&
    el.tag !== 'template' &&
    !el.key
  ) {
    state.warn(
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
      `v-for should have explicit keys. ` +
      `See https://vuejs.org/guide/list.html#key for more info.`,
      el.rawAttrsMap['v-for'],
      true /* tip */
    )
  }

  // 标记，当前节点的 v-for 指令已经被处理过了
  el.forProcessed = true // avoid recursion
  // v-for 指令的处理结果 _l(exp, function(alias, iterator1...) {return _c(tag, data, children)})
  return `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
      `return ${(altGen || genElement)(el, state)}` +
    '})'
}

/**
 * 处理结果的所有属性， 得到结果为 json 字符串， 比如 data = {key: xx, ref: xx}
 */
export function genData (el: ASTElement, state: CodegenState): string {

  // json 字符串
  let data = '{'

  // 首先处理指令 得到 data = {directive:[{name, rawName, value, expression, modifiers}, ...], }
  // directives first.
  // directives may mutate the el's other properties before they are generated.
  const dirs = genDirectives(el, state)
  if (dirs) data += dirs + ','

  // key data = { key: xx }
  if (el.key) {
    data += `key:${el.key},`
  }
  // ref data = { key: xx, ref: xx }
  if (el.ref) {
    data += `ref:${el.ref},`
  }
  // 带有 ref 属性的节点如果被包裹在带有 v-for 指令的节点内部时，得到 data = {refInFor:true}
  if (el.refInFor) {
    data += `refInFor:true,`
  }
  // pre v-pre 指令， data = { per: true }
  if (el.pre) {
    data += `pre:true,`
  }
  // 处理动态组件， 得到 data = {tag: 'component'}
  // record original tag name for components using "is" attribute
  if (el.component) {
    data += `tag:"${el.tag}",`
  }

  // 执行模块 (class, style) 的 genData 方法， 处理节点上 style class 
  // 最终得到 data = {staticClass: xx, class: xx, style: xx}
  // module data generation functions
  for (let i = 0; i < state.dataGenFns.length; i++) {
    data += state.dataGenFns[i](el)
  }
  // 处理属性，结果是 data = {attrs: xx}
  // attributes
  /**
   * genProps 分两种情况
   * 1. 只有静态属性
   * data = {attr: 'attrName: attrValue, ...'}
   * 2. 存在动态属性 data = {attr: '_d(staticProps, [attrName: attrValue, ...])'}
   */
  if (el.attrs) {
    data += `attrs:${genProps(el.attrs)},`
  }
  // data = {domProps: xx}
  // DOM props
  if (el.props) {
    data += `domProps:${genProps(el.props)},`
  }
  // event handlers
  // 动态时， 返回结果为 data = {on:_d(staticHandlers, [dynamicHandlers])}
  // 静态， 直接返回 data = {on:${staticHandlers}}
  if (el.events) {
    data += `${genHandlers(el.events, false)},`
  }
  // 处理带有 .native 修饰符的事件，结果为
   // 动态时， 返回结果为 data = {nativeOn:_d(staticHandlers, [dynamicHandlers])}
  // 静态， 直接返回 data = {nativeOn:${staticHandlers}}
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true)},`
  }
  // 处理非作用域插槽， 得到结果 data = {slot: slotName}
  // slot target
  // only for non-scoped slots
  if (el.slotTarget && !el.slotScope) {
    data += `slot:${el.slotTarget},`
  }
  // 处理作用域插槽， 结果为 data = {scopedSlots: _u(xxx)}
  // scoped slots
  if (el.scopedSlots) {
    data += `${genScopedSlots(el, el.scopedSlots, state)},`
  }

  // 带有 v-model 的指令组件， 结果为 data = {modal: value, callback, expression}
  // component v-model
  if (el.model) {
    data += `model:{value:${
      el.model.value
    },callback:${
      el.model.callback
    },expression:${
      el.model.expression
    }},`
  }

  // 处理内联模板， 结果为 data = {inlineTemplate: {render, staticRenderFns}}
  // inline-template
  if (el.inlineTemplate) {
    const inlineTemplate = genInlineTemplate(el, state)
    if (inlineTemplate) {
      data += `${inlineTemplate},`
    }
  }
  data = data.replace(/,$/, '') + '}'
  // v-bind dynamic argument wrap
  // v-bind with dynamic arguments must be applied using the same v-bind object
  // merge helper so that class/style/mustUseProp attrs are handled correctly.
  if (el.dynamicAttrs) {
    data = `_b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})`
  }
  // v-bind data wrap
  if (el.wrapData) {
    data = el.wrapData(data)
  }
  // v-on data wrap
  if (el.wrapListeners) {
    data = el.wrapListeners(data)
  }
  return data
}

// 编译指令，如果指令存在运行时任务， 则 return 指令信息出去
// res = `directive:[{name, rawName, value, expression, modifiers}, ...]`
function genDirectives (el: ASTElement, state: CodegenState): string | void {
  // 得到所有指令数组
  const dirs = el.directives
  if (!dirs) return
  // 最终处理要得到的结果
  let res = 'directives:['
  let hasRuntime = false
  // 标记， 标记当前指令是否存在运行时的任务
  let i, l, dir, needRuntime
  // 遍历指令数组
  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i]
    needRuntime = true
    // 获取当前指令的处理方法， 比如 dir.name = text, v-text
    const gen: DirectiveFunction = state.directives[dir.name]
    if (gen) {
      // compile-time directive that manipulates AST.
      // returns true if it also needs a runtime counterpart.
      // 指令 gen 方法， 编译当前指令， 比如 v-text， 或者 v-model
      // 返回结果为 boolean， 数值给 needRuntime， 标记当前指令是否存在运行时的任务
      needRuntime = !!gen(el, dir, state.warn)
    }
    if (needRuntime) {
      // 存在 运行时任务 比如 v-model ， 得到最终的结果， 并 return 出去
      // res = `directive:[{name, rawName, value, expression, modifiers}, ...]`
      hasRuntime = true
      res += `{name:"${dir.name}",rawName:"${dir.rawName}"${
        dir.value ? `,value:(${dir.value}),expression:${JSON.stringify(dir.value)}` : ''
      }${
        dir.arg ? `,arg:${dir.isDynamicArg ? dir.arg : `"${dir.arg}"`}` : ''
      }${
        dir.modifiers ? `,modifiers:${JSON.stringify(dir.modifiers)}` : ''
      }},`
    }
  }
  if (hasRuntime) {
    // 指令运行时任务， 则 return 结果
    // 去 ， 加 ]
    return res.slice(0, -1) + ']'
  }
}

function genInlineTemplate (el: ASTElement, state: CodegenState): ?string {
  const ast = el.children[0]
  if (process.env.NODE_ENV !== 'production' && (
    el.children.length !== 1 || ast.type !== 1
  )) {
    state.warn(
      'Inline-template components must have exactly one child element.',
      { start: el.start }
    )
  }
  if (ast && ast.type === 1) {
    const inlineRenderFns = generate(ast, state.options)
    return `inlineTemplate:{render:function(){${
      inlineRenderFns.render
    }},staticRenderFns:[${
      inlineRenderFns.staticRenderFns.map(code => `function(){${code}}`).join(',')
    }]}`
  }
}

function genScopedSlots (
  el: ASTElement,
  slots: { [key: string]: ASTElement },
  state: CodegenState
): string {
  // by default scoped slots are considered "stable", this allows child
  // components with only scoped slots to skip forced updates from parent.
  // but in some cases we have to bail-out of this optimization
  // for example if the slot contains dynamic names, has v-if or v-for on them...
  let needsForceUpdate = el.for || Object.keys(slots).some(key => {
    const slot = slots[key]
    return (
      slot.slotTargetDynamic ||
      slot.if ||
      slot.for ||
      containsSlotChild(slot) // is passing down slot from parent which may be dynamic
    )
  })

  // #9534: if a component with scoped slots is inside a conditional branch,
  // it's possible for the same component to be reused but with different
  // compiled slot content. To avoid that, we generate a unique key based on
  // the generated code of all the slot contents.
  let needsKey = !!el.if

  // OR when it is inside another scoped slot or v-for (the reactivity may be
  // disconnected due to the intermediate scope variable)
  // #9438, #9506
  // TODO: this can be further optimized by properly analyzing in-scope bindings
  // and skip force updating ones that do not actually use scope variables.
  if (!needsForceUpdate) {
    let parent = el.parent
    while (parent) {
      if (
        (parent.slotScope && parent.slotScope !== emptySlotScopeToken) ||
        parent.for
      ) {
        needsForceUpdate = true
        break
      }
      if (parent.if) {
        needsKey = true
      }
      parent = parent.parent
    }
  }

  const generatedSlots = Object.keys(slots)
    .map(key => genScopedSlot(slots[key], state))
    .join(',')

  return `scopedSlots:_u([${generatedSlots}]${
    needsForceUpdate ? `,null,true` : ``
  }${
    !needsForceUpdate && needsKey ? `,null,false,${hash(generatedSlots)}` : ``
  })`
}

function hash(str) {
  let hash = 5381
  let i = str.length
  while(i) {
    hash = (hash * 33) ^ str.charCodeAt(--i)
  }
  return hash >>> 0
}

function containsSlotChild (el: ASTNode): boolean {
  if (el.type === 1) {
    if (el.tag === 'slot') {
      return true
    }
    return el.children.some(containsSlotChild)
  }
  return false
}

function genScopedSlot (
  el: ASTElement,
  state: CodegenState
): string {
  const isLegacySyntax = el.attrsMap['slot-scope']
  if (el.if && !el.ifProcessed && !isLegacySyntax) {
    return genIf(el, state, genScopedSlot, `null`)
  }
  if (el.for && !el.forProcessed) {
    return genFor(el, state, genScopedSlot)
  }
  const slotScope = el.slotScope === emptySlotScopeToken
    ? ``
    : String(el.slotScope)
  const fn = `function(${slotScope}){` +
    `return ${el.tag === 'template'
      ? el.if && isLegacySyntax
        ? `(${el.if})?${genChildren(el, state) || 'undefined'}:undefined`
        : genChildren(el, state) || 'undefined'
      : genElement(el, state)
    }}`
  // reverse proxy v-slot without scope on this.$slots
  const reverseProxy = slotScope ? `` : `,proxy:true`
  return `{key:${el.slotTarget || `"default"`},fn:${fn}${reverseProxy}}`
}

/**
 * 得到当前节点所有子节点的渲染函数， 格式为
 * '[_c(tag, data, children), ...], normalizationType'
 */
export function genChildren (
  el: ASTElement,
  state: CodegenState,
  checkSkip?: boolean,
  altGenElement?: Function,
  altGenNode?: Function
): string | void {
  // 拿到当前节点的所有子节点
  const children = el.children
  if (children.length) {
    // 获取第一个子节点
    const el: any = children[0]
    // optimize single v-for
    // 这个是一个优化，先不看
    if (children.length === 1 &&
      el.for &&
      el.tag !== 'template' &&
      el.tag !== 'slot'
    ) {
      // 得到节点规范化类型，结果 为 0， 1 和 2  不是重点
      // 只有一个子节点 && 这个子节点上面有 v-for 指令 && 节点标签名不是 template 或者 slot
      const normalizationType = checkSkip
        ? state.maybeComponent(el) ? `,1` : `,0`
        : ``
      // 优化： 直接调用 genElement 方法的到结果， 不需要走下面的循环以及调用 genNode 方法了
      return `${(altGenElement || genElement)(el, state)}${normalizationType}`
    }
    // 得到节点规范化类型，结果为 0， 1， 2 ， 不是重点
    const normalizationType = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0
    // 这是个函数
    const gen = altGenNode || genNode
    // '[_c(tag, data, children), ...], normalizationType'
    return `[${children.map(c => gen(c, state)).join(',')}]${
      normalizationType ? `,${normalizationType}` : ''
    }`
  }
}

// determine the normalization needed for the children array.
// 0: no normalization needed
// 1: simple normalization needed (possible 1-level deep nested array)
// 2: full normalization needed
function getNormalizationType (
  children: Array<ASTNode>,
  maybeComponent: (el: ASTElement) => boolean
): number {
  let res = 0
  for (let i = 0; i < children.length; i++) {
    const el: ASTNode = children[i]
    if (el.type !== 1) {
      continue
    }
    if (needsNormalization(el) ||
        (el.ifConditions && el.ifConditions.some(c => needsNormalization(c.block)))) {
      res = 2
      break
    }
    if (maybeComponent(el) ||
        (el.ifConditions && el.ifConditions.some(c => maybeComponent(c.block)))) {
      res = 1
    }
  }
  return res
}

function needsNormalization (el: ASTElement): boolean {
  return el.for !== undefined || el.tag === 'template' || el.tag === 'slot'
}

function genNode (node: ASTNode, state: CodegenState): string {
  if (node.type === 1) {
    return genElement(node, state)
  } else if (node.type === 3 && node.isComment) {
    return genComment(node)
  } else {
    return genText(node)
  }
}

export function genText (text: ASTText | ASTExpression): string {
  return `_v(${text.type === 2
    ? text.expression // no need for () because already wrapped in _s()
    : transformSpecialNewlines(JSON.stringify(text.text))
  })`
}

export function genComment (comment: ASTText): string {
  return `_e(${JSON.stringify(comment.text)})`
}

function genSlot (el: ASTElement, state: CodegenState): string {
  const slotName = el.slotName || '"default"'
  const children = genChildren(el, state)
  let res = `_t(${slotName}${children ? `,function(){return ${children}}` : ''}`
  const attrs = el.attrs || el.dynamicAttrs
    ? genProps((el.attrs || []).concat(el.dynamicAttrs || []).map(attr => ({
        // slot props are camelized
        name: camelize(attr.name),
        value: attr.value,
        dynamic: attr.dynamic
      })))
    : null
  const bind = el.attrsMap['v-bind']
  if ((attrs || bind) && !children) {
    res += `,null`
  }
  if (attrs) {
    res += `,${attrs}`
  }
  if (bind) {
    res += `${attrs ? '' : ',null'},${bind}`
  }
  return res + ')'
}

// componentName is el.component, take it as argument to shun flow's pessimistic refinement
function genComponent (
  componentName: string,
  el: ASTElement,
  state: CodegenState
): string {
  const children = el.inlineTemplate ? null : genChildren(el, state, true)
  return `_c(${componentName},${genData(el, state)}${
    children ? `,${children}` : ''
  })`
}

function genProps (props: Array<ASTAttr>): string {
  // 静态属性
  let staticProps = ``
  // 动态属性
  let dynamicProps = ``
  // 遍历 props 数组
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]
    const value = __WEEX__
      ? generateValue(prop.value)
      : transformSpecialNewlines(prop.value)
    if (prop.dynamic) {
      // 动态属性 dattrname,dattrvalue
      dynamicProps += `${prop.name},${value},`
    } else {
      // 静态属性 attrname: value
      staticProps += `"${prop.name}":${value},`
    }
  }
  // 
  staticProps = `{${staticProps.slice(0, -1)}}`
  if (dynamicProps) {
    // 如果存在动态属性，则返回 _d(staticProps, [dattrname,dattrvalue, ...])
    return `_d(${staticProps},[${dynamicProps.slice(0, -1)}])`
  } else {
    // 如果是静态属性，直接返回 'attrName: attrValue, ...'
    return staticProps
  }
}

/* istanbul ignore next */
function generateValue (value) {
  if (typeof value === 'string') {
    return transformSpecialNewlines(value)
  }
  return JSON.stringify(value)
}

// #3895, #4268
function transformSpecialNewlines (text: string): string {
  return text
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
