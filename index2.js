const { computed, watch, createElementBlock, createElementVNode, ref, reactive } = Vue

// debugger
Vue.createApp({
    setup() {
        // const msg = ref('msg from setup')
        // const arr = reactive([1,2])
        const count = ref(1)
        // watch([arr, count], (val) => {
        //     console.log('watch', val)
        // })
        const plusOne = computed({
            get: () => plusTwo.value + 1,
            set: (val) => {
              plusTwo.value = val - 1
            }
        })
        const plusTwo = computed({
            get: () => plusOne.value + 1,
            set: (val) => {
                plusOne.value = val - 1
            }
        })
        return {
            plusOne,
            plusTwo,
            count,
            // msg,
            // arr
        }
    },
    methods: {
        changeMsg() {
            this.count++
            // this.arr.push(4)
            // console.log('computed', this.plusOne)
            // console.log('computed2', this.plusTwo)
        }
    },
    render: (_ctx, _cache) => {
        return createElementBlock("div", null, [
            createElementVNode("p", null, String(_ctx.plusTwo), 1 /* TEXT */),
            createElementVNode("button", { onClick: _ctx.changeMsg }, "点击试试", 8 /* PROPS */, ["onClick"])
        ])
    }
}).mount('#app')