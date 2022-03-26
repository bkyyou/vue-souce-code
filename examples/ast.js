const ns = "ns";
// eslint-disable-next-line no-unused-vars
function createASTElement(tag, attrs, parent) {
  return {
    type: 1,
    tag,
    // 属性数组， [{name: 'id', value: 'app', start: 5, end: 13}]
    attrsList: attrs,
    // [{attrName: attrValue}] 和 attrsMap 一样
    // eslint-disable-next-line no-undef
    attrsMap: makeAttrsMap(attrs), // {id: 'app', :class: "'111'"}
    start: 0, // 非生产环境
    end: 0, // 非生产环境
    rawAttrsMap: {}, // id: {name: 'id', value: 'app', start: 5, end: 13}
    // parent: {}, // 标记父元素
    // children: {}, // 子元素
    // 标记父元素
    parent,
    // 存放所有的子元素
    children: [],
    // 命名空间
    ns,
    // v-for
    for: "迭代器", // 比如： 数组
    alias: "别名", // 比如 item
    // key
    key: "exp",
    // ref
    ref: "val",
    refInFor: true, // boolean
    // 插槽
    slotTarget: "插槽名",
    slotTargetDynamic: "boolean",
    slotScope: "作用域插槽的值",
    scopedSlots: {
      name: {
        slotTarget: "插槽名称",
        slotTargetDynamic: "boolean", // 是否为动态插槽
        children: ["所有插槽内所有的子元素"],
        slotScope: "作用域插槽的值",
      },
    },
    // slot 标签
    slotName: "具名插槽的名称",
    // 动态组件
    component: "compName",
    inlineTemplate: "boolean",
    staticClass: "静态的 class",
    classBinding: "动态的class",
    staticStyle: "静态的 style",
    styleBinding: "动态的 style",
    // 事件
    nativeEvents: {}, // 内容同 events 一样
    events: {
      name: [{ value: "", dynamic: "", modifiers: "", start: "", end: "" }],
    },
    // props
    props: { name: "", value: "", modifiers: "", start: "", end: "" },
    // attrs
    dynamicAttrs: [], // 内容同 attrs 一样
    attrs: [{ name: "", value: "", dynamic: "", start: "", end: "" }],
    // 其他指令
    directives: [
      {
        name: "",
        rawName: "",
        value: "",
        arg: "",
        isDynamicArg: "",
        modifiers: "",
      },
    ],
    processed: true, // 标记已经被处理过了
    // v-if
    ifConditions: [{ exp: "", block: "" }],
    elseif: "elseifConitions",
    else: true,
    // v-pre
    pre: true,
    once: true, // 只在初始化更新一次，之后就不用在更新了
  };
}

// [_c('div',{staticClass:"cla"},[_v(_s(msg))]),_v(" "),_c('div',{staticClass:"cla"},[_v("111")])]
