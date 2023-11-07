const onRE = /^on[^a-z]/
export const isOn = (key) => onRE.test(key)
export const isModelListener = (key) => key.startsWith('onUpdate:')

export const patchProp = (
    el,
    key,
    prevValue,
    nextValue,
    isSVG = false,
    prevChildren,
    parentComponent,) => {
        if (isOn(key)) {
            if (!isModelListener(key)) {
                patchEvent(el, key, prevValue, nextValue, parentComponent)
            }
        }
}
const hyphenateRE = /\B([A-Z])/g
const hyphenate = (str) =>
  str.replace(hyphenateRE, '-$1').toLowerCase()


const optionsModifierRE = /(?:Once|Passive|Capture)$/

function parseName(name) {
    let options
    if (optionsModifierRE.test(name)) {

    }
    const event = name[2] === ':' ? name.slice(3) : hyphenate(name.slice(2))
    return [event, options]
}

const createInvoker = (initialValue, instance) => {
    const invoker = (e) => {
        invoker.value.call(instance, [e])
    }
    invoker.value = initialValue
    // invoker.attached = getNow()
    return invoker
}

export function addEventListener(
    el,
    event,
    handler,
    options
  ) {
    el.addEventListener(event, handler, options)
  }

export function patchEvent(el, rawName, prevValue, nextValue, instance) {
    const invokers = el._vei || (el._vei = {})
    const [name, options] = parseName(rawName)
    if (nextValue) {
        const invoker = (invokers[rawName] = createInvoker(nextValue, instance))
        addEventListener(el, name, invoker, options)
    }
}