export const nodeOps = {
    insert: (child, parent, anchor) => {
        parent.insertBefore(child, anchor || null)
    },
    setElementText: (el, text) => {
        el.textContent = text
    },
    createElement (tag) {
        const el = document.createElement(tag)
        return el
    },
    parentNode(node) {
        return node.parentNode
    },
    nextSibling (node) {
        return node => node.nextSibling
    },
    remove (child) {
        const parent = child.parentNode
        if (parent) {
        parent.removeChild(child)
        }
    }
}