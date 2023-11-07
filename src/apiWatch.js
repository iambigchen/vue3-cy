import { isRef, isReactive } from './component'
import { ReactiveEffect } from './effect'
import { queueJob } from './scheduler'

export function watch (source, cb, { immediate, deep, flush, onTrack, onTrigger } = {}) {
    let getter = () => {}
    if (isRef(source)) {
        getter = () => source.value
    } else if (isReactive(source)) {
        getter = () => source
        deep = true
    } else if (Array.isArray(source)) {
        getter = () => {
            return source.map(s => {
                if (isRef(s)) {
                    return s.value
                } else if (isReactive(s)) {
                    return traverse(s)
                }
            })
        }        
    }

    const job = () => {
        if (!effect.active) {
            return
        }
        if (cb) {
            const newValue = effect.run()
            cb(newValue)
        }
    }

    let scheduler = () => queueJob(job)

    const effect = new ReactiveEffect(getter, scheduler)

    if (cb) {
        if (immediate) {
            job()
        } else {
            oldValue = effect.run()
        }
    }
}


export function traverse (value, seen) {
    if (!(typeof value === 'object' && value !== 'null')) return value
    seen = seen || new Set()
    if (seen.has(value)) {
        return value
    }
    seen.add(value)
    if (isRef(value)) {
        traverse(value.value, seen)
    } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            traverse(value[i], seen)
        }
    }
    return value
}