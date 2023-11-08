(() => {
  // src/component.js
  var hasOwnProperty = Object.prototype.hasOwnProperty;
  var hasOwn = (val, key) => hasOwnProperty.call(val, key);
  var PublicInstanceProxyHandlers = {
    get({ _: instance }, key) {
      const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
      if (key[0] !== "$") {
        const n = accessCache[key];
        if (n !== void 0) {
          switch (n) {
            case 1:
              return setupState[key];
            case 2:
              return data[key];
            case 4:
              return ctx[key];
            case 3:
              return props[key];
          }
        } else if (hasOwn(setupState, key)) {
          accessCache[key] = 1;
          return setupState[key];
        } else if (hasOwn(data, key)) {
          accessCache[key] = 2;
          return data[key];
        } else if (hasOwn(props, key)) {
          accessCache[key] = 3;
          return props[key];
        } else if (hasOwn(ctx, key)) {
          accessCache[key] = 4;
          return ctx[key];
        }
      }
    },
    set({ _: instance }, key, value) {
      const { data, setupState, ctx } = instance;
      if (hasOwn(setupState, key)) {
        setupState[key] = value;
        return true;
      } else if (hasOwn(data, key)) {
        data[key] = value;
        return true;
      } else if (hasOwn(instance.props, key)) {
        warn(`Attempting to mutate prop "${key}". Props are readonly.`);
        return false;
      }
    }
  };
  var shallowUnwrapHandlers = {
    get: (target, key, receiver) => unref(Reflect.get(target, key, receiver)),
    set: (target, key, value, receiver) => {
      const oldValue2 = target[key];
      if (isRef(oldValue2) && !isRef(value)) {
        oldValue2.value = value;
        return true;
      } else {
        return Reflect.set(target, key, value, receiver);
      }
    }
  };
  function unref(ref2) {
    return isRef(ref2) ? ref2.value : ref2;
  }
  function isRef(r) {
    return !!(r && r.__v_isRef === true);
  }
  function isReactive(value) {
    return !!(value && value["__v_isReactive"]);
  }
  function proxyRefs(objectWithRefs) {
    return isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
  }
  var handleSetupResult = (instance, setupResult) => {
    instance.setupState = proxyRefs(setupResult);
    finishComponentSetup(instance);
  };
  function applyOptions(instance) {
    const ctx = instance.ctx;
    const publicThis = instance.proxy;
    const { methods } = instance.type;
    if (methods) {
      for (const key in methods) {
        const methodHandler = methods[key];
        if (typeof methodHandler === "function") {
          ctx[key] = methodHandler.bind(publicThis);
        }
      }
    }
  }

  // src/reactive.js
  var reactiveMap = /* @__PURE__ */ new WeakMap();
  var isIntegerKey = (key) => {
    return typeof key === "string" && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
  };
  function markRaw(value) {
    Object.defineProperty(value, "__v_skip", {
      configurable: true,
      enumerable: false,
      value: true
    });
    return value;
  }
  var toReactive = (value) => {
    return value !== null && typeof value === "object" ? reactive(value) : value;
  };
  var reactive = (target) => {
    return createReactiveObject(
      target,
      false,
      mutableHandlers,
      reactiveMap
    );
  };
  function createReactiveObject(target, isReadonly, baseHandlers, proxyMap) {
    if (!(target !== null && typeof target === "object")) {
      return target;
    }
    const existingProxy = proxyMap.get(target);
    if (existingProxy) {
      return existingProxy;
    }
    const proxy = new Proxy(target, baseHandlers);
    proxyMap.set(target, proxy);
    return proxy;
  }
  var arrayInstrumentations = createArrayInstrumentations();
  function createArrayInstrumentations() {
    const instrumentations = {};
    ["includes", "indexOf", "lastIndexOf"].forEach((key) => {
      instrumentations[key] = function(...args) {
        const arr = toRaw(this);
        for (let i = 0, l = this.length; i < l; i++) {
          track(arr, "get", i + "");
        }
        const res = arr[key](...args);
        if (res === -1 || res === false) {
          return arr[key](...args.map(toRaw));
        } else {
          return res;
        }
      };
    });
    ["push", "pop", "shift", "unshift", "splice"].forEach((key) => {
      instrumentations[key] = function(...args) {
        pauseTracking();
        const res = toRaw(this)[key].apply(this, args);
        resetTracking();
        return res;
      };
    });
    return instrumentations;
  }
  var mutableHandlers = {
    get(target, key, receiver) {
      if (key === "__v_isReactive") {
        return true;
      }
      if (key === "__v_raw" && receiver === reactiveMap.get(target)) {
        return target;
      }
      const targetIsArray = Array.isArray(target);
      const res = Reflect.get(target, key, receiver);
      if (key === "__v_isRef" || key === "__proto__" || key === "__isVue") {
        return res;
      }
      if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }
      track(target, "get", key);
      if (isRef(res)) {
        return res.value;
      }
      return res;
    },
    set(target, key, value, receiver) {
      let oldValue2 = target[key];
      oldValue2 = toRaw(oldValue2);
      value = toRaw(value);
      const hasKey = Array.isArray(key) && isIntegerKey(key) ? Number(key) < target.length : hasOwn(target, key);
      const result = Reflect.set(target, key, value, receiver);
      if (!hasKey) {
        trigger(target, "add", key, value);
      } else if (hasChanged(value, oldValue2)) {
        trigger(target, "set", key, value, oldValue2);
      }
      return result;
    },
    deleteProperty() {
    },
    has() {
    },
    ownKeys(target) {
      track(target, "iterate", Array.isArray(target) ? "length" : ITERATE_KEY);
      return Reflect.ownKeys(target);
    }
  };

  // src/effect.js
  var ITERATE_KEY = Symbol("iterate");
  var targetMap = /* @__PURE__ */ new WeakMap();
  var effectTrackDepth = 0;
  var trackOpBit = 1;
  var activeEffect;
  var trackStack = [];
  var shouldTrack = true;
  var ReactiveEffect = class {
    active = true;
    deps = [];
    parent = void 0;
    fn;
    scheduler;
    constructor(fn, scheduler) {
      this.fn = fn;
      this.scheduler = scheduler;
    }
    run() {
      if (!this.active) {
        return this.fn();
      }
      let parent = activeEffect;
      while (parent) {
        if (parent === this) {
          return;
        }
        parent = parent.parent;
      }
      let lastShouldTrack = shouldTrack;
      try {
        this.parent = activeEffect;
        activeEffect = this;
        shouldTrack = true;
        trackOpBit = 1 << ++effectTrackDepth;
        return this.fn();
      } finally {
        trackOpBit = 1 << --effectTrackDepth;
        activeEffect = this.parent;
        shouldTrack = lastShouldTrack;
        this.parent = void 0;
      }
    }
  };
  var createDep = (effects) => {
    const dep = new Set(effects);
    dep.w = 0;
    dep.n = 0;
    return dep;
  };
  function track(target, type, key) {
    if (shouldTrack && activeEffect) {
      let depsMap = targetMap.get(target);
      if (!depsMap) {
        targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
      }
      let dep = depsMap.get(key);
      if (!dep) {
        depsMap.set(key, dep = createDep());
      }
      trackEffects(dep);
    }
  }
  function trackEffects(dep) {
    let shouldTrack2 = false;
    dep.add(activeEffect);
    activeEffect.deps.push(dep);
  }
  function trackRefValue(ref2) {
    if (shouldTrack && activeEffect) {
      ref2 = toRaw(ref2);
      trackEffects(ref2.dep || (ref2.dep = createDep()));
    }
  }
  function trigger(target, type, key, newValue, oldValue2, oldTarget) {
    const depsMap = targetMap.get(target);
    if (!depsMap) {
      return;
    }
    let deps = [];
    if (type === "clear") {
    } else if (key === "length" && Array.isArray(target)) {
      const newLength = Number(newValue);
      depsMap.forEach((dep, key2) => {
        if (key2 === "length" || key2 >= newLength) {
          deps.push(dep);
        }
      });
    } else {
      if (key !== void 0) {
        deps.push(depsMap.get(key));
      }
      switch (type) {
        case "add":
          if (!Array.isArray(target)) {
            deps.push(depsMap.get(ITERATE_KEY));
          } else if (isIntegerKey(key)) {
            deps.push(depsMap.get("length"));
          }
      }
    }
    if (deps.length === 1) {
      if (deps[0]) {
        triggerEffects(deps[0]);
      }
    } else {
      const effects = [];
      for (const dep of deps) {
        if (dep) {
          effects.push(...dep);
        }
      }
      triggerEffects(createDep(effects));
    }
  }
  function triggerEffects(dep) {
    const effects = Array.isArray(dep) ? dep : [...dep];
    for (const effect of effects) {
      if (effect.computed) {
        triggerEffect(effect);
      }
    }
    for (const effect of effects) {
      if (!effect.computed) {
        triggerEffect(effect);
      }
    }
  }
  function triggerEffect(effect) {
    if (effect !== activeEffect) {
      if (effect.scheduler) {
        effect.scheduler();
      } else {
        effect.run();
      }
    }
  }
  function triggerRefValue(ref2, newVal) {
    ref2 = toRaw(ref2);
    const dep = ref2.dep;
    if (dep) {
      triggerEffects(dep);
    }
  }
  function pauseTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = false;
  }
  function resetTracking() {
    const last = trackStack.pop();
    shouldTrack = last === void 0 ? true : last;
  }

  // src/nodeOps.js
  var nodeOps = {
    insert: (child, parent, anchor) => {
      parent.insertBefore(child, anchor || null);
    },
    setElementText: (el, text) => {
      el.textContent = text;
    },
    createElement(tag) {
      const el = document.createElement(tag);
      return el;
    },
    parentNode(node) {
      return node.parentNode;
    },
    nextSibling(node) {
      return (node2) => node2.nextSibling;
    },
    remove(child) {
      const parent = child.parentNode;
      if (parent) {
        parent.removeChild(child);
      }
    }
  };

  // src/props.js
  var onRE = /^on[^a-z]/;
  var isOn = (key) => onRE.test(key);
  var isModelListener = (key) => key.startsWith("onUpdate:");
  var patchProp = (el, key, prevValue, nextValue, isSVG = false, prevChildren, parentComponent) => {
    if (isOn(key)) {
      if (!isModelListener(key)) {
        patchEvent(el, key, prevValue, nextValue, parentComponent);
      }
    }
  };
  var hyphenateRE = /\B([A-Z])/g;
  var hyphenate = (str) => str.replace(hyphenateRE, "-$1").toLowerCase();
  var optionsModifierRE = /(?:Once|Passive|Capture)$/;
  function parseName(name) {
    let options;
    if (optionsModifierRE.test(name)) {
    }
    const event = name[2] === ":" ? name.slice(3) : hyphenate(name.slice(2));
    return [event, options];
  }
  var createInvoker = (initialValue, instance) => {
    const invoker = (e) => {
      invoker.value.call(instance, [e]);
    };
    invoker.value = initialValue;
    return invoker;
  };
  function addEventListener(el, event, handler, options) {
    el.addEventListener(event, handler, options);
  }
  function patchEvent(el, rawName, prevValue, nextValue, instance) {
    const invokers = el._vei || (el._vei = {});
    const [name, options] = parseName(rawName);
    if (nextValue) {
      const invoker = invokers[rawName] = createInvoker(nextValue, instance);
      addEventListener(el, name, invoker, options);
    }
  }

  // src/scheduler.js
  var queue = [];
  var isFlushing = false;
  var isFlushPending = false;
  var resolvedPromise = Promise.resolve();
  var currentFlushPromise = null;
  var flushIndex = 0;
  function queueJob(job) {
    if (!queue.length || !queue.includes(job)) {
      queue.push(job);
      queueFlush();
    }
  }
  function queueFlush() {
    if (!isFlushing && !isFlushPending) {
      isFlushPending = true;
      currentFlushPromise = resolvedPromise.then(flushJobs);
    }
  }
  function flushJobs(seen) {
    isFlushPending = false;
    isFlushing = true;
    try {
      for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
        const job = queue[flushIndex];
        if (job && job.active !== false) {
          job();
        }
      }
    } finally {
      flushIndex = 0;
      queue.length = 0;
      isFlushing = false;
      currentFlushPromise = null;
    }
  }

  // src/apiWatch.js
  function watch(source, cb, { immediate, deep, flush, onTrack, onTrigger } = {}) {
    let getter = () => {
    };
    if (isRef(source)) {
      getter = () => source.value;
    } else if (isReactive(source)) {
      getter = () => source;
      deep = true;
    } else if (Array.isArray(source)) {
      getter = () => {
        return source.map((s) => {
          if (isRef(s)) {
            return s.value;
          } else if (isReactive(s)) {
            return traverse(s);
          }
        });
      };
    }
    const job = () => {
      if (!effect.active) {
        return;
      }
      if (cb) {
        const newValue = effect.run();
        cb(newValue);
      }
    };
    let scheduler = () => queueJob(job);
    const effect = new ReactiveEffect(getter, scheduler);
    if (cb) {
      if (immediate) {
        job();
      } else {
        oldValue = effect.run();
      }
    }
  }
  function traverse(value, seen) {
    if (!(typeof value === "object" && value !== "null"))
      return value;
    seen = seen || /* @__PURE__ */ new Set();
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
    if (isRef(value)) {
      traverse(value.value, seen);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        traverse(value[i], seen);
      }
    }
    return value;
  }

  // src/apiComputed.js
  function computed(getterOrOptions) {
    let getter;
    let setter;
    const onlyGetter = typeof getterOrOptions === "function";
    if (onlyGetter) {
      getter = getterOrOptions;
      setter = () => {
      };
    } else {
      getter = getterOrOptions.get;
      setter = getterOrOptions.set;
    }
    const cRef = new ComputedRefImpl(getter, setter, onlyGetter || !setter);
    return cRef;
  }
  var ComputedRefImpl = class {
    __v_isRef = true;
    _dirty = true;
    _value;
    _cacheable;
    constructor(getter, _setter, isReadonly) {
      this.getter = getter;
      this._setter = _setter;
      this.effect = new ReactiveEffect(getter, () => {
        if (!this._dirty) {
          this._dirty = true;
          triggerRefValue(this);
        }
      });
      this.effect.computed = this;
    }
    get value() {
      const self = toRaw(this);
      trackRefValue(this);
      if (self._dirty || !self._cacheable) {
        self._dirty = false;
        self._value = self.effect.run();
      }
      return self._value;
    }
    set value(newValue) {
      this._setter(newValue);
    }
  };

  // src/index.js
  var EMPTY_OBJ = Object.freeze({});
  var {
    insert: hostInsert,
    createElement: hostCreateElement,
    setElementText: hostSetElementText,
    nextSibling: hostNextSibling,
    parentNode: hostParentNode,
    remove: hostRemove
  } = nodeOps;
  var isMounted = false;
  var uid = 0;
  var createVNode = (type, props, children) => {
    const shapeFlag = typeof type === "string" ? 1 : 4;
    const vnode = {
      __v_isVNode: true,
      __v_skip: true,
      type,
      props,
      children,
      shapeFlag
    };
    if (children) {
      vnode.shapeFlag = typeof children === "string" ? 8 : 16;
    }
    return vnode;
  };
  var initProps = (instance, rawProps, isStateful) => {
    const props = {};
    instance.propsDefaults = /* @__PURE__ */ Object.create(null);
    if (isStateful) {
      instance.props = props;
    }
  };
  function finishComponentSetup(instance) {
    const Component = instance.type;
    if (!instance.render) {
      instance.render = Component.render;
    }
    applyOptions(instance);
  }
  var createComponentInstance = (vnode, parent) => {
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
      setupContext: null
    };
    instance.ctx = { _: instance };
    instance.root = parent ? parent.root : instance;
    return instance;
  };
  var normalizeVNode = (child) => {
    return child;
  };
  var renderComponentRoot = (instance) => {
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
      inheritAttrs
    } = instance;
    let result;
    if (vnode.shapeFlag === 4) {
      const proxyToUse = withProxy || proxy;
      result = normalizeVNode(
        render.call(proxyToUse, proxyToUse, renderCache, props, setupState, data, ctx)
      );
    }
    return result;
  };
  var createApp = (...args) => {
    const [rootComponent, rootProps = null] = [...args];
    function processElement(n1, n2, container, anchor = null, parentComponent = null) {
      if (n1 == null) {
        mountElement(n2, container, anchor, parentComponent);
      } else {
        patchElement(n1, n2, parentComponent);
      }
    }
    const getNextHostNode = (vnode) => {
      return hostNextSibling(vnode.anchor || vnode.el);
    };
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
          if (key !== "value") {
            patchProp(
              el,
              key,
              null,
              props[key],
              false,
              vnode.children,
              parentComponent
            );
          }
        }
      }
      hostInsert(el, container, anchor);
    };
    const patchElement = (n1, n2, parentComponent) => {
      const el = n2.el = n1.el;
      let { children } = n2;
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent
      );
    };
    const patchChildren = (n1, n2, container, anchor, parentComponent) => {
      const c1 = n1 && n1.children;
      const prevShapeFlag = n1 ? n1.shapeFlag : 0;
      const c2 = n2.children;
      const { shapeFlag } = n2;
      if (shapeFlag === 8) {
        if (prevShapeFlag === 16) {
          unmountChildren(c1, parentComponent);
        }
        if (c2 !== c1) {
          hostSetElementText(container, c2);
        }
      } else {
        if (prevShapeFlag === 16) {
          if (shapeFlag === 16) {
            patchKeyedChildren(
              c1,
              c2,
              container,
              anchor,
              parentComponent
            );
          } else {
            unmountChildren(c1, parentComponent);
          }
        } else {
          if (prevShapeFlag === 8) {
            hostSetElementText(container, "");
          }
          if (shapeFlag === 16) {
            mountChildren(
              c2,
              container,
              anchor,
              parentComponent
            );
          }
        }
      }
    };
    const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent) => {
      let i = 0;
      const l2 = c2.length;
      let e1 = c1.length - 1;
      let e2 = l2 - 1;
      while (i <= e1 && i <= e2) {
        const n1 = c1[i];
        const n2 = c2[i];
        if (n1.type === n2.type && n1.key === n2.key) {
          patch(
            n1,
            n2,
            container,
            null,
            parentComponent
          );
        } else {
          break;
        }
        i++;
      }
      while (i <= e1 && i <= e2) {
        const n1 = c1[i];
        const n2 = c2[i];
        if (n1.type === n2.type && n1.key === n2.key) {
          patch(
            n1,
            n2,
            container,
            null,
            parentComponent
          );
        } else {
          break;
        }
        e1--;
        e2--;
      }
      if (i > e1) {
        if (i <= e2) {
          const nextPos = e2 + 1;
          const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
          while (i <= e2) {
            patch(
              null,
              c2[i],
              container,
              anchor,
              parentComponent
            );
            i++;
          }
        }
      } else if (i > e2) {
        while (i <= e1) {
          unmount(c1[i], parentComponent);
          i++;
        }
      } else {
        const s1 = i;
        const s2 = i;
        const keyToNewIndexMap = /* @__PURE__ */ new Map();
        for (i = s2; i <= e2; i++) {
          const nextChild = c2[i];
          if (nextChild.key != null) {
            keyToNewIndexMap.set(nextChild.key, i);
          }
        }
        let j;
        let patched = 0;
        const toBePatched = e2 - s2 + 1;
        let moved = false;
        let maxNewIndexSoFar = 0;
        const newIndexToOldIndexMap = new Array(toBePatched);
        for (i = 0; i < toBePatched; i++)
          newIndexToOldIndexMap[i] = 0;
        for (i = s1; i <= e1; i++) {
          const prevChild = c1[i];
          if (patched >= toBePatched) {
          }
          let newIndex;
          if (prevChild.key != null) {
            newIndex = keyToNewIndexMap.get(prevChild.key);
          } else {
            for (j = s2; j <= e2; j++) {
              if (newIndexToOldIndexMap[j - s2] === 0 && prevChild.type === c2[j].type && prevChild.key === c2[j].key) {
                newIndex = j;
                break;
              }
            }
          }
          if (newIndex === void 0) {
            unmount(prevChild, parentComponent);
          } else {
          }
        }
      }
    };
    const unmountChildren = (children, parentComponent, start = 0) => {
      for (let i = start; i < children.length; i++) {
        unmount(children[i], parentComponent);
      }
    };
    const unmount = (vnode, parentComponent) => {
      const {
        type,
        props,
        ref: ref2,
        children,
        dynamicChildren,
        shapeFlag,
        patchFlag,
        dirs
      } = vnode;
      if (shapeFlag === 6) {
      } else {
        remove(vnode);
      }
    };
    const remove = (vnode) => {
      const { type, el, anchor, transition } = vnode;
      hostRemove(el);
    };
    const mountChildren = (children, container, anchor, parentComponent, start = 0) => {
      for (let i = start; i < children.length; i++) {
        const child = children[i];
        patch(null, child, container, anchor, parentComponent);
      }
    };
    function processComponent(n1, n2, container, anchor = null, parentComponent = null) {
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
          const subTree = instance.subTree = renderComponentRoot(instance);
          patch(null, subTree, container, anchor, instance);
          instance.isMounted = true;
        } else {
          let { next, vnode } = instance;
          if (next) {
            next.el = vnode.el;
          } else {
            next = vnode;
          }
          const nextTree = renderComponentRoot(instance);
          const prevTree = instance.subTree;
          instance.subTree = nextTree;
          patch(prevTree, nextTree, hostParentNode(prevTree.el), getNextHostNode(prevTree), instance);
        }
      };
      const effect = instance.effect = new ReactiveEffect(
        componentUpdateFn,
        () => queueJob(update)
      );
      const update = instance.update = () => effect.run();
      update.id = instance.uid;
      update();
    };
    function setupComponent(instance) {
      const { props } = instance.vnode;
      const isStateful = instance.vnode.shapeFlag === 4;
      initProps(instance, props, isStateful);
      const setupResult = isStateful ? setupStatefulComponent(instance) : void 0;
      return setupResult;
    }
    function setupStatefulComponent(instance) {
      const Component = instance.type;
      instance.accessCache = /* @__PURE__ */ Object.create(null);
      instance.proxy = markRaw(new Proxy(instance.ctx, PublicInstanceProxyHandlers));
      const { setup } = Component;
      if (setup) {
        const setupResult = setup.call(instance);
        handleSetupResult(instance, setupResult);
      } else {
        finishComponentSetup(instance);
      }
    }
    function patch(n1, n2, container, anchor = null, parentComponent = null) {
      if (n1 === n2) {
        return;
      }
      if (n1 && !(n1.type === n2.type && n1.key === n2.key)) {
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
      }
    };
  };
  var createElementBlock = (...args) => {
    return createVNode(...args);
  };
  var createElementVNode = (...args) => {
    return createVNode(...args);
  };
  function toRaw(observed) {
    const raw = observed && observed["__v_raw"];
    return raw ? toRaw(raw) : observed;
  }
  function createRef(rawValue, shallow) {
    if (isRef(rawValue)) {
      return rawValue;
    }
    return new RefImpl(rawValue, shallow);
  }
  var ref = (value) => {
    return createRef(value, false);
  };
  var RefImpl = class {
    _value;
    _rawValue;
    dep = void 0;
    __v_isRef = true;
    constructor(value, __v_isShallow) {
      this._rawValue = __v_isShallow ? value : toRaw(value);
      this._value = __v_isShallow ? value : toReactive(value);
    }
    get value() {
      trackRefValue(this);
      return this._value;
    }
    set value(newVal) {
      newVal = toRaw(newVal);
      if (hasChanged(newVal, this._rawValue)) {
        this._rawValue = newVal;
        this._value = toReactive(newVal);
        triggerRefValue(this, newVal);
      }
    }
  };
  var hasChanged = (value, oldValue2) => !Object.is(value, oldValue2);
  window.Vue = {
    createApp,
    createElementBlock,
    createElementVNode,
    ref,
    reactive,
    watch,
    computed
  };
})();
//# sourceMappingURL=index.js.map
