/* @flow */

import { parseText } from 'compiler/parser/text-parser'
import {
  getAndRemoveAttr,
  getBindingAttr,
  baseWarn
} from 'compiler/helpers'

// 处理元素上的静态和动态的属性， 得到 staticClass  和 classBinding
function transformNode (el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  // 获取 class 属性值
  const staticClass = getAndRemoveAttr(el, 'class')
  if (process.env.NODE_ENV !== 'production' && staticClass) {
    const res = parseText(staticClass, options.delimiters)
    if (res) {
      // <div class="{{ className }}"></div> 应该替换为 <div :class="className"></div>
      warn(
        `class="${staticClass}": ` +
        'Interpolation inside attributes has been removed. ' +
        'Use v-bind or the colon shorthand instead. For example, ' +
        'instead of <div class="{{ val }}">, use <div :class="val">.',
        el.rawAttrsMap['class']
      )
    }
  }
  // 静态的 class
  if (staticClass) {
    // el.staticClass = className
    el.staticClass = JSON.stringify(staticClass)
  }
  // 处理 <div :class="{{className}}"></div>
  const classBinding = getBindingAttr(el, 'class', false /* getStatic */)
  if (classBinding) {
    el.classBinding = classBinding
  }
}

function genData (el: ASTElement): string {
  let data = ''
  if (el.staticClass) {
    data += `staticClass:${el.staticClass},`
  }
  if (el.classBinding) {
    data += `class:${el.classBinding},`
  }
  return data
}

export default {
  staticKeys: ['staticClass'],
  transformNode,
  genData
}
