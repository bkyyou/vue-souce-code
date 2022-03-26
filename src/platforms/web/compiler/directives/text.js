/* @flow */

import { addProp } from 'compiler/helpers'

export default function text (el: ASTElement, dir: ASTDirective) {
  if (dir.value) {
    // 在 el 对象上添加 textContent 属性的值为 _s(value)
    addProp(el, 'textContent', `_s(${dir.value})`, dir)
  }
}
