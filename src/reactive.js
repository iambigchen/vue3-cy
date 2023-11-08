import { track, trigger, pauseTracking, resetTracking, ITERATE_KEY } from './effect'
import { hasChanged, toRaw } from './index'
import { isRef, hasOwn } from './component'
export const reactiveMap = new WeakMap()

export const isIntegerKey = (key) => {
    return ((typeof key === 'string') &&
    key !== 'NaN' &&
    key[0] !== '-' &&
    '' + parseInt(key, 10) === key)
}

export function markRaw (value) {
    Object.defineProperty(value, '__v_skip', {
        configurable: true,
        enumerable: false,
        value: true
    })
    return value
}

export const toReactive = (value) => {
    return (value !== null && typeof value === 'object') ? reactive(value) : value
}

export const reactive = (target) => {
    return createReactiveObject(
      target,
      false,
      mutableHandlers,
      reactiveMap
    )
}


function createReactiveObject(
    target,
    isReadonly,
    baseHandlers,
    proxyMap
  ) {
    if (!(target !== null && typeof target === 'object')) {
        return target
    }

    const existingProxy = proxyMap.get(target)
    if (existingProxy) {
        return existingProxy
    }

    const proxy = new Proxy(target,  baseHandlers)
    proxyMap.set(target, proxy)
    return proxy
  }

  const arrayInstrumentations = createArrayInstrumentations()
  function createArrayInstrumentations() {
    const instrumentations = {}
    ;['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
        instrumentations[key] = function (...args) {
            const arr = toRaw(this)
            for (let i = 0, l = this.length; i < l; i++) {
                track(arr, 'get', i + '')
            }
            const res = arr[key](...args)
            if (res === -1 || res === false) {
                return arr[key](...args.map(toRaw))
            } else {
                return res
            }
        }
    })

    ;['push', 'pop', 'shift', 'unshift', 'splice'].forEach(key => {
        instrumentations[key] = function (...args) {
            pauseTracking()
            const res = toRaw(this)[key].apply(this, args)
            resetTracking()
            return res
        }
    })
    return instrumentations
  }


  export const mutableHandlers = {
    get (target, key, receiver) {
        if (key === '__v_isReactive') {
            return true
        }
        if (key === '__v_raw' && receiver === reactiveMap.get(target)) {
            return target
        }


        const targetIsArray = Array.isArray(target)
        const res = Reflect.get(target, key, receiver)

        if (key === '__v_isRef' || key === '__proto__' || key === '__isVue') {
            return res
        }

        if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
            return Reflect.get(arrayInstrumentations, key, receiver)
        }
        track(target, 'get', key)

        if (isRef(res)) {
            return res.value
        }
        return res
    },
    set (target, key, value, receiver) {
        let oldValue = target[key]
        oldValue = toRaw(oldValue)
        value = toRaw(value)
        const hasKey = Array.isArray(key) && isIntegerKey(key) ? Number(key) < target.length : hasOwn(target, key)
        const result = Reflect.set(target, key, value, receiver)
        if (!hasKey) {
            trigger(target, 'add', key, value)
        } else if (hasChanged(value, oldValue)) {
            trigger(target, 'set', key, value, oldValue)
        }
        return result
    },
    deleteProperty () {

    },
    has () {

    },
    ownKeys (target) {
        track(target, 'iterate', Array.isArray(target) ? 'length' : ITERATE_KEY)
        return Reflect.ownKeys(target)
    }
  }