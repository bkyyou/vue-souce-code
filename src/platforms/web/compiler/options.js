/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  // 负责编译 class style v-model(input)
  modules,
  // 指令
  directives,
  // per 标签
  isPreTag,
  // 是否为 一元标签
  isUnaryTag,
  // 一些必须用 props 的属性
  mustUseProp,
  // 只有开始标签的标签
  canBeLeftOpenTag,
  // 保留标签
  isReservedTag,
  // 命名空间
  getTagNamespace,
  // 静态key
  staticKeys: genStaticKeys(modules)
}
