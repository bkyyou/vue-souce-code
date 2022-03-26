/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 执行 baseCompile 之前所有的事情，只有一个目的，就是构造最终的编译配置
  // 核心
  // 解析，将 html 模板字符串解析为 ast 对象
  const ast = parse(template.trim(), options)
  // 优化， 静态标记 遍历 ast 标记为静态节点和静态根节点
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  console.log('compiler ast', ast);
  // 代码生成, 将 ast 转换成 可执行的 render 函数的字符串形式
  // 最终代码字符串 code = _c(tag, data, children, normalizationType)
  const code = generate(ast, options)
  console.log('compiler code', code);
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
