/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  // 函数  获取静态 key，比如 staticStyle， staticClass
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  // 判断是否是平台保留标签
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 静态节点标记
  markStatic(root)
  // second pass: mark static roots.
  // 标记静态根节点
  markStaticRoots(root, false)
}

function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

/**
 * 标记每个节点是否为静态节点， 通过 static 属性来标记
 */
function markStatic (node: ASTNode) {
  // 在节点设置 static 属性， 标记节点是否静态节点
  node.static = isStatic(node)
  if (node.type === 1) {
    // do not make component slot content static. this avoids  // 不要将组件的插槽设为静态，这样可以避免
    // 1. components not able to mutate slot nodes // 1.无法更改插槽节点的组件
    // 2. static slot content fails for hot-reloading // 2.静态插槽内容无法进行热重装
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      // 非平台保留标签 && 不是 slot 标签 && 没有 inline-template
      return
    }
    // 遍历子节点，循环对每个子节点做静态标记
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      // 如果子节点为动态节点，父节点也要更新为动态节点
      if (!child.static) {
        node.static = false
      }
    }
    // 节点存在 v-if v-else-if v-else 指令， 则对 block 进行静态标记
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

// 标记静态根节点
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      // 静态节点或者存在 v-once 指令的节点， 进来标记当前节点是否被包裹在 v-for 指令所在的节点内部
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      // 节点是静态节点 && 存在子节点 && 子节点不能只有一个文本节点， 这样的节点被标记为静态根节点
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    // 如果当前节点不是静态根节点，则继续处理子节点，对子节点进行静态根节点的标记
    if (node.children) {
      // 遍历子节点，通过递归在所有的子节点上标记是否为静态根节点
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    // 节点存在 v-if v-else-if v-else 时， 对 block 做静态根节点标记
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

/**
 * 非静态节点
 * 表达式、有指令绑定、框架内置的标签、v-for 指令的内部 template 标签
 * 其他情况则为静态节点，比如文本节点
 */
function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression
    return false
  }
  if (node.type === 3) { // text
    return true
  }
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in // component slot
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) && // 不是在 v-for 所在节点内的 template 标签
    Object.keys(node).every(isStaticKey)
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
