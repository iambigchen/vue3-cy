import { toRaw } from "."
import { ReactiveEffect, triggerRefValue, trackRefValue } from "./effect"

export function computed (getterOrOptions) {
    let getter
    let setter
    const onlyGetter = typeof getterOrOptions === 'function'
    if (onlyGetter) {
        getter = getterOrOptions
        setter = () => {}
    } else {
        getter = getterOrOptions.get
        setter = getterOrOptions.set
    }
    const cRef = new ComputedRefImpl(getter, setter, onlyGetter || !setter)
    return cRef
}


export class ComputedRefImpl {
    __v_isRef = true
    _dirty = true
    _value
    _cacheable
    constructor (getter, _setter, isReadonly) {
        this.getter = getter
        this._setter = _setter
        this.effect = new ReactiveEffect(getter, () => {
            if (!this._dirty) {
                this._dirty = true
                triggerRefValue(this)
            }
        })
        this.effect.computed = this
    }

    get value () {
        const self = toRaw(this)
        trackRefValue(this)
        if (self._dirty || !self._cacheable) {
            self._dirty = false
            self._value = self.effect.run()
        }
        return self._value
    }

    set value (newValue) {
        this._setter(newValue)
    }
}