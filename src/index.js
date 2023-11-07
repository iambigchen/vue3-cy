import { ReactiveEffect, trackRefValue, triggerRefValue } from "./effect";
import { nodeOps } from "./nodeOps";
import { markRaw, toReactive, reactive } from './reactive'
import { PublicInstanceProxyHandlers, handleSetupResult, applyOptions, isRef } from './component'
import { patchProp as hostPatchProp } from './props'
import { queueJob } from './scheduler'
import { watch } from './apiWatch'
import { computed } from './apiComputed'
const EMPTY_OBJ = Object.freeze({})
const {
  insert: hostInsert,
  createElement: hostCreateElement,
  setElementText: hostSetElementText,
  nextSibling: hostNextSibling,
  parentNode: hostParentNode,
  remove: hostRemove
} = nodeOps;

let isMounted = false;
let uid = 0;
const createVNode = (type, props, children) => {
  const shapeFlag = typeof type === "string" ? 1 : 4;
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    children,
    shapeFlag,
  };
  if (children) {
    vnode.shapeFlag = typeof children === "string" ? 8 : 16;
  }
  return vnode;
};

const initProps = (instance, rawProps, isStateful) => {
  const props = {}
  instance.propsDefaults = Object.create(null)
  if (isStateful) {
    instance.props = props
  }
}

export function finishComponentSetup(instance) {
  const Component = instance.type;
  if (!instance.render) {
    instance.render = Component.render;
  }
  applyOptions(instance)
}

const createComponentInstance = (vnode, parent) => {
  const type = vnode.type;
  const instance = {
    uid: uid++,
    vnode,
    type,
    parent,

    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,
  };
  instance.ctx = { _: instance }
  instance.root = parent ? parent.root : instance;
  return instance;
};

const normalizeVNode = (child) => {
  return child;
};

const renderComponentRoot = (instance) => {
  const {
    type: Component,
    vnode,
    proxy,
    withProxy,
    props,
    propsOptions,
    slots,
    attrs,
    emit,
    render,
    renderCache,
    data,
    setupState,
    ctx,
    inheritAttrs,
  } = instance;
  let result;
  if (vnode.shapeFlag === 4) {
    const proxyToUse = withProxy || proxy
    result = normalizeVNode(
      render.call(proxyToUse, proxyToUse, renderCache, props, setupState, data, ctx)
    );
  }
  return result;
};

const createApp = (...args) => {
  const [rootComponent, rootProps = null] = [...args];
  function processElement(
    n1,
    n2,
    container,
    anchor = null,
    parentComponent = null
  ) {
    if (n1 == null) {
      mountElement(n2, container, anchor, parentComponent);
    } else {
      patchElement(n1, n2, parentComponent)
    }
  }

  const getNextHostNode = vnode => {
    return hostNextSibling(vnode.anchor || vnode.el)
  }

  const mountElement = (vnode, container, anchor, parentComponent) => {
    let el;
    const { type, props, shapeFlag, transition, dirs } = vnode;
    el = vnode.el = hostCreateElement(vnode.type);

    if (vnode.shapeFlag === 8) {
      hostSetElementText(el, vnode.children);
    } else if (vnode.shapeFlag === 16) {
      mountChildren(vnode.children, el, null, parentComponent);
    }
    if (props) {
      for (const key in props) {
        if (key !== 'value') {
          hostPatchProp(
            el,
            key,
            null,
            props[key],
            false,
            vnode.children,
            parentComponent
          )
        }
      }
    }
    hostInsert(el, container, anchor);
  };

  const patchElement = (n1, n2, parentComponent) => {
    const el = (n2.el = n1.el)
    let { children } = n2
    patchChildren(
      n1,
      n2,
      el,
      null,
      parentComponent
    )
    // if (n1.children !== n2.children) {
    //   hostSetElementText(el, n2.children)
    // }
  }

  const patchChildren = (
    n1,
    n2,
    container,
    anchor,
    parentComponent,
  ) => {
    const c1 = n1 && n1.children
    const prevShapeFlag = n1 ? n1.shapeFlag : 0
    const c2 = n2.children

    const { shapeFlag } = n2
    if (shapeFlag === 8) {
      if (prevShapeFlag === 16) {
        unmountChildren(c1, parentComponent)
      }
      if (c2 !== c1) {
        hostSetElementText(container, c2)
      }
    } else {
      if (prevShapeFlag === 16) {
        if (shapeFlag === 16) {
          patchKeyedChildren(
            c1,
            c2,
            container,
            anchor,
            parentComponent,
          )
        } else {
          unmountChildren(c1, parentComponent)
        }
      } else {
        if (prevShapeFlag === 8) {
          hostSetElementText(container, '')
        }

        if (shapeFlag === 16) {
          mountChildren(
            c2,
            container,
            anchor,
            parentComponent
          )
        }
      }
    }

  }

  const patchKeyedChildren = (
    c1,
    c2,
    container,
    parentAnchor,
    parentComponent,
  ) => {
    let i = 0
    const l2 = c2.length
    let e1 = c1.length - 1 // prev ending index
    let e2 = l2 - 1 // next ending index

    while (i <= e1 && i <= e2) {
      const n1 = c1[i]
      const n2 = c2[i]
      if (n1.type === n2.type && n1.key === n2.key) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
        )
      } else {
        break
      }
      i++
    }

    while (i <= e1 && i <= e2) {
      const n1 = c1[i]
      const n2 = c2[i]
      if (n1.type === n2.type && n1.key === n2.key) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
        )
      } else {
        break
      }
      e1--
      e2--
    }

    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1
        const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor
        while (i <= e2) {
          patch(
            null,
            c2[i],
            container,
            anchor,
            parentComponent,
          )
          i++
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent)
        i++
      }
    } else {
      const s1 = i
      const s2 = i
      const keyToNewIndexMap = new Map()
      for (i = s2; i <= e2; i++) {
        const nextChild = c2[i]
        if (nextChild.key != null) {
          keyToNewIndexMap.set(nextChild.key, i)
        }
      }

      let j
      let patched = 0
      const toBePatched = e2 - s2 + 1
      let moved = false
      let maxNewIndexSoFar = 0

      const newIndexToOldIndexMap = new Array(toBePatched)
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0

      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i]
        if (patched >= toBePatched) {

        }
        let newIndex
        if (prevChild.key != null) {
          newIndex = keyToNewIndexMap.get(prevChild.key)
        } else {
          for (j = s2; j <= e2; j++) {
            if (
              newIndexToOldIndexMap[j - s2] === 0 &&
              prevChild.type === c2[j].type && prevChild.key === c2[j].key
            ) {
              newIndex = j
              break
            }
          }
        }
        if (newIndex === undefined) {
          unmount(prevChild, parentComponent)
        } else {

        }
      }
    }
  }

  const unmountChildren = (
    children,
    parentComponent,
    start = 0
  ) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent)
    }
  }

  const unmount = (
    vnode,
    parentComponent,
  ) => {
    const {
      type,
      props,
      ref,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs
    } = vnode
    if (shapeFlag === 6) {
      // unmountComponent(vnode.component)
    } else {
      remove(vnode)
    }
  }

  const remove = (vnode) => {
    const { type, el, anchor, transition } = vnode
    hostRemove(el)
  }

  const mountChildren = (
    children,
    container,
    anchor,
    parentComponent,
    start = 0
  ) => {
    for (let i = start; i < children.length; i++) {
      const child = children[i];
      patch(null, child, container, anchor, parentComponent);
    }
  };

  function processComponent(
    n1,
    n2,
    container,
    anchor = null,
    parentComponent = null
  ) {
    if (n1 === null) {
      mountComponent(n2, container, anchor, parentComponent);
    }
  }

  function mountComponent(initialVNode, container, anchor, parentComponent) {
    const instance = createComponentInstance(initialVNode, parentComponent);
    setupComponent(instance);
    setupRenderEffect(instance, initialVNode, container, anchor);
  }

  const setupRenderEffect = (instance, initialVNode, container, anchor) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        const { el, props } = initialVNode;
        const subTree = (instance.subTree = renderComponentRoot(instance));
        patch(null, subTree, container, anchor, instance);
        instance.isMounted = true
      } else {
        let { next, vnode } = instance
        if (next) {
          next.el = vnode.el
        } else {
          next = vnode
        }
        const nextTree = renderComponentRoot(instance)
        const prevTree = instance.subTree
        instance.subTree = nextTree
        patch(prevTree, nextTree, hostParentNode(prevTree.el), getNextHostNode(prevTree), instance);
      }
    };
    const effect = (instance.effect = new ReactiveEffect(
      componentUpdateFn,
      () => queueJob(update),
    ));
    const update = (instance.update = () => effect.run());
    update.id = instance.uid;
    update();
  };

  function setupComponent(instance) {
    const { props } = instance.vnode
    const isStateful = instance.vnode.shapeFlag === 4;

    initProps(instance, props, isStateful)

    const setupResult = isStateful
      ? setupStatefulComponent(instance)
      : undefined;
    
    return setupResult;
  }

  function setupStatefulComponent(instance) {
    const Component = instance.type;
    instance.accessCache = Object.create(null);
    instance.proxy = markRaw(new Proxy(instance.ctx, PublicInstanceProxyHandlers))
    const { setup } = Component;
    if (setup) {
      const setupResult = setup.call(instance);
      handleSetupResult(instance, setupResult)
    } else {
      finishComponentSetup(instance);
    }
  }

  function patch(n1, n2, container, anchor = null, parentComponent = null) {
    if (n1 === n2) {
      return;
    }
    if (n1 && !(n1.type === n2.type && n1.key === n2.key)) {
      // anchor = getNextHostNode(n1)
      // unmount(n1, parentComponent)
      // n1 = null
    }
    const { shapeFlag } = n2;

    if (shapeFlag !== 4) {
      processElement(n1, n2, container, anchor, parentComponent);
    } else if (shapeFlag === 4) {
      processComponent(n1, n2, container, anchor, parentComponent);
    }
  }
  function render(vnode, container) {
    patch(container._vnode || null, vnode, container, null, null);
  }

  function mount(rootContainer) {
    if (!isMounted) {
      const vnode = createVNode(rootComponent, rootProps);
      render(vnode, rootContainer);
      isMounted = true;
    }
  }

  console.log(rootComponent);
  return {
    mount(containerOrSelector) {
      const container = document.querySelector(containerOrSelector);
      container.innerHTML = "";
      mount(container);
    },
  };
};

const createElementBlock = (...args) => {
  return createVNode(...args);
};
const createElementVNode = (...args) => {
  return createVNode(...args);
};

export function toRaw(observed) {
  const raw = observed && observed['__v_raw']
  return raw ? toRaw(raw) : observed
}


function createRef(rawValue, shallow) {
  if (isRef(rawValue)) {
    return rawValue
  }
  return new RefImpl(rawValue, shallow)
}

const ref = (value) => {
  return createRef(value, false)
}

class RefImpl{
  _value
  _rawValue
  dep = undefined
  __v_isRef = true
  constructor(value, __v_isShallow) {
    this._rawValue = __v_isShallow ? value : toRaw(value)
    this._value = __v_isShallow ? value : toReactive(value)
  }

  get value () {
    trackRefValue(this)
    return this._value
  }

  set value (newVal) {
    newVal = toRaw(newVal)
    if (hasChanged(newVal, this._rawValue)) {
      this._rawValue = newVal
      this._value = toReactive(newVal)
      triggerRefValue(this, newVal)
    }
  }
}


export const hasChanged = (value, oldValue) =>
  !Object.is(value, oldValue)

window.Vue = {
  createApp,
  createElementBlock,
  createElementVNode,
  ref,
  reactive,
  watch,
  computed
};
