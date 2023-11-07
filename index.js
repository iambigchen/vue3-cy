const { createElementBlock } = Vue
debugger
Vue.createApp({
    render: () => {
        return createElementBlock("div", null, "hello")
    }
}).mount('#app')