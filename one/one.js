class Vue {
    constructor(options = {}) {//数据的初始化
        this.$el = document.querySelector(options.el);
        let data = this.data = options.data;
        // 代理data，使其能直接this.xxx的方式访问data，正常的话需要this.data.xxx
        Object.keys(data).forEach((key) => {
            this.proxyData(key);
        });
        this.methods = options.methods // 事件方法
        this.watcherTask = {}; // 需要监听的任务列表
        this.observer(data); // 初始化劫持监听所有数据
        this.compile(this.$el); // 解析dom
    }
    proxyData(key) {
        //上面主要是代理data到最上层，this.xxx的方式直接访问data
        let that = this;
        Object.defineProperty(that, key, {
            configurable: false, // 不能再define
            enumerable: true,// 可枚举
            get() {
                return that.data[key];
            },
            set(newVal) {
                that.data[key] = newVal;
            }
        });
    }
    observer(data) {
        //劫持监听所有数据
        //同样是使用Object.defineProperty来监听数据，初始化需要订阅的数据。 
        //把需要订阅的数据到push到watcherTask里，等到时候需要更新的时候就可以批量更新数据了。
        let that = this
        Object.keys(data).forEach(key => {
            let value = data[key]
            this.watcherTask[key] = []
            Object.defineProperty(data, key, {
                configurable: false,
                enumerable: true,
                get() {
                    return value
                },
                set(newValue) {
                    if (newValue !== value) {
                        value = newValue
                        //遍历订阅池，批量更新视图。
                        that.watcherTask[key].forEach(task => {
                            task.update()
                        })
                    }
                }
            })
        })
    }
    compile(el) {
        //解析dom
        var nodes = el.childNodes;
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.nodeType === 3) {
                //当前元素是文本节点
                var text = node.textContent.trim();
                if (!text) continue;
                this.compileText(node, 'textContent')
            } else if (node.nodeType === 1) {
                //当前元素是元素节点
                if (node.childNodes.length > 0) {
                    this.compile(node)
                }
                if (node.hasAttribute('v-model') && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA')) {
                    node.addEventListener('input', (() => {
                        let attrVal = node.getAttribute('v-model')
                        this.watcherTask[attrVal].push(new Watcher(node, this, attrVal, 'value'))
                        node.removeAttribute('v-model')
                        return () => {
                            this.data[attrVal] = node.value
                        }
                    })())
                }
                if (node.hasAttribute('v-html')) {
                    //首先判断node节点上是否有v-html这种指令，如果存在的话，我们就发布订阅
                    //只需要把当前需要订阅的数据push到watcherTask里面，然后到时候在设置值的时候就可以批量更新了，实现双向数据绑定
                    //然后push的值是一个Watcher的实例，首先他new的时候会先执行一次，执行的操作就是去把 纯双花括号 -> 1 ，也就是说把我们写好的模板数据更新到模板视图上。 
                    //最后把当前元素属性剔除出去，我们用Vue的时候也是看不到这种指令的，不剔除也不影响
                    let attrVal = node.getAttribute('v-html');
                    this.watcherTask[attrVal].push(new Watcher(node, this, attrVal, 'innerHTML'))
                    node.removeAttribute('v-html')
                }
                this.compileText(node, 'innerHTML')
                if (node.hasAttribute('@click')) {
                    let attrVal = node.getAttribute('@click')
                    node.removeAttribute('@click')
                    node.addEventListener('click', e => {
                        this.methods[attrVal] && this.methods[attrVal].bind(this)()
                    })
                }
            }
        }
    }
    compileText(node, type) {//解析dom里处理纯双花括号的操作
        let reg = /\{\{(.*?)\}\}/g, txt = node.textContent;
        if (reg.test(txt)) {
            node.textContent = txt.replace(reg, (matched, value) => {
                let tpl = this.watcherTask[value] || []
                tpl.push(new Watcher(node, this, value, type))
                if (value.split('.').length > 1) {
                    let v = null
                    value.split('.').forEach((val, i) => {
                        v = !v ? this[val] : v[val]
                    })
                    return v
                } else {
                    return this[value]
                }
            })
        }
    }
}

class Watcher {//更新视图操作
    constructor(el, vm, value, type) {
        //之前发布订阅之后走了这里面的操作，意思就是把当前元素如：node.innerHTML = '这是data里面的值'、node.value = '这个是表单的数据'
        this.el = el;
        this.vm = vm;
        this.value = value;
        this.type = type;
        this.update()
    }
    update() {
        this.el[this.type] = this.vm.data[this.value]
    }
}