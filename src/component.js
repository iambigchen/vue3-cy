import { finishComponentSetup } from './index'

const hasOwnProperty = Object.prototype.hasOwnProperty
export const hasOwn = (
  val,
  key
) => hasOwnProperty.call(val, key)

export const PublicInstanceProxyHandlers = {
  get({ _: instance }, key) {
    const { ctx, setupState, data, props, accessCache, type, appContext } =
      instance;
    if (key[0] !== "$") {
      const n = accessCache[key];
      if (n !== undefined) {
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
        accessCache[key] = 1
        return setupState[key]
      } else if (hasOwn(data, key)) {
        accessCache[key] = 2
        return data[key]
      } else if (hasOwn(props, key)) {
        accessCache[key] = 3
        return props[key]
      } else if (hasOwn(ctx, key)) {
        accessCache[key] = 4
        return ctx[key]
      }
    }
  },
  set({ _: instance }, key, value) {
    const { data, setupState, ctx } = instance
    if (hasOwn(setupState, key)) {
        setupState[key] = value
        return true
    } else if (hasOwn(data, key)) {
        data[key] = value
        return true
    } else if (hasOwn(instance.props, key)) {
        warn(`Attempting to mutate prop "${key}". Props are readonly.`)
        return false
    }
  }
};

const shallowUnwrapHandlers = {
    get: (target, key, receiver) => unref(Reflect.get(target, key, receiver)),
    set: (target, key, value, receiver) => {
        const oldValue = target[key]
        if (isRef(oldValue) && !isRef(value)) {
            oldValue.value = value
            return true
        } else {
            return Reflect.set(target, key, value, receiver)
        }
    }
}

export function unref(ref){
    return isRef(ref) ? (ref.value) : ref
  }

export function isRef (r) {
    return !!(r && r.__v_isRef === true)
}

export function isReactive(value) {
    return !!(value && value['__v_isReactive'])
}

function proxyRefs (objectWithRefs) {
    return isReactive(objectWithRefs)
    ? objectWithRefs
    : new Proxy(objectWithRefs, shallowUnwrapHandlers)
}

export const handleSetupResult = (instance, setupResult) => {
    instance.setupState = proxyRefs(setupResult)
    finishComponentSetup(instance)
}

export function applyOptions(instance) {
    const ctx = instance.ctx
    const publicThis = instance.proxy
    const { methods } = instance.type
    if (methods) {
        for (const key in methods) {
            const methodHandler = methods[key]
            if (typeof methodHandler === 'function') {
                ctx[key] = methodHandler.bind(publicThis)
            }   
        }
    }
}