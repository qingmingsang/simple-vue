//核心是Object.defineProperty
function SVue(options = {}) {
  this.$options = options;
  this.$methods = options.methods;
  let data = this._data = this.$options.data;
  observe(data);// 实现数据的监听 
  Object.keys(data).forEach(key => {
    this._proxyData(key);
  })
  new Compile(options.el, this);// 编译
}

SVue.prototype._proxyData = function (key) {
  Object.defineProperty(this, key, {
    configurable: false,
    enumerable: true,
    get() {
      return this._data[key];
    },
    set(newVal) {
      this._data[key] = newVal;
    }
  })
}

function observe(data) {
  if (Object.prototype.toString.call(data) !== '[object Object]') {
    return false;
  }
  return new Observer(data);
}

function Observer(data) {
  let dep = new Dep();
  Object.keys(data).forEach(key => {
    let val = data[key];
    observe(val); // key对应的值进行递归检查，如果值是object类型则再次对key进行监听
    Object.defineProperty(data, key, {
      configurable: false,
      enumerable: true,
      get() {
        Dep.target && dep.addSub(Dep.target);//1️⃣添加订阅器， dep为订阅器的容器（即数组）
        return val;
      },
      set(newVal) {
        if (val === newVal) { return }
        val = newVal;
        observe(newVal); // 赋值后需要对新值再次监听
        dep.notify(); //2️⃣当对key重新赋值后，需要发布订阅，通知使用此key的数据一起变化
      }
    })
  })
  return dep;
}
/*
    1️⃣处解释：
    对象访问内部key时，
    会触发get的执行(即1️⃣处),每次访问key都会触发，
    所以会在此处添加订阅器,以便当key对应的value发生改变时发布订阅器，
    对于每一个key都会拥有一个订阅器，但每次访问key都会触发get的执行，
    是不是会对同一个key添加多个订阅器呢？为了避免此情况的出现，
    会在初始化时为其执行一遍key的访问，并且在此时添加订阅器，
    此后对于key的访问将过滤掉订阅器的添加，所以1️⃣处添加订阅器前进行判断真假
*/

function Dep() {
  //容器，存储订阅器
  this.subs = []
}

Dep.prototype = {
  addSub(sub) {
    this.subs.push(sub)
  },
  notify() {
    //2️⃣处对应，通知数据已经变化
    this.subs.forEach(sub => sub.update())
  }
}
const compileUtil = {
  text: function (node, vm, attrValue) {
    let _this = this
    this.compileText(node, vm, attrValue)
    let keys = '{{' + attrValue + '}}'
    new Watcher(vm, keys, () => _this.compileText(node, vm, attrValue))
  },
  compileText: function (node, vm, attrValue) {
    let keys = attrValue.split('.')
    let data = vm._data
    keys.forEach(key => {
      data = data[key]
    })
    node.textContent = data
  },
  model: function (node, vm, attrValue) {
    let data = vm._data
    let _this = this
    let keys = attrValue.split('.')
    keys.forEach(key => {
      data = data[key]
    })
    node.value = data
    node.addEventListener('input', function (e) {
      let value = e.target.value
      if (value === data) { return }
      _this.setVal(vm, value, keys)
    }, false)
    new Watcher(vm, '{{' + attrValue + '}}', () => {
      let data = vm._data
      let _this = this
      let keys = attrValue.split('.')
      keys.forEach(key => {
        data = data[key]
      })
      node.value = data
    })
  },
  setVal: function (vm, value, keys) {
    if (keys.length === 1) {
      vm[keys[0]] = value
    } else {
      for (let i = 0; i < keys.length; i++) {
        this.setVal(vm[keys[i]], value, keys.slice(i + 1))
      }
    }
  }
}
function Compile(el, vm) {
  //编译
  vm.$el = document.querySelector(el)
  let fragment = this.createFragment(vm.$el)
  this.compileContent(fragment, vm)// 核心
  vm.$el.appendChild(fragment)
}

Compile.prototype = {
  createFragment: function (el) {
    let child = el.firstChild
    let fragment = document.createDocumentFragment()
    while (child) {
      fragment.appendChild(child)
      child = el.firstChild
    }
    return fragment
  },
  compileContent: function (frag, vm) {
    // 正式编译view内容
    let _this = this
    Array.from(frag.childNodes).forEach(node => {
      let txt = node.textContent
      let reg = /\{\{(\s*[a-zA-Z_]+(\w|\.)*\s*)\}\}/g
      if (node.childNodes && node.childNodes.length) {
        this.compileContent(node, vm)
      }
      if (node.nodeType === 3 && reg.test(txt)) {
        //判断节点是否为文本节点
        let arr = txt.match(reg)
        this.compileText(node, vm, arr)
        arr.forEach(item => {
          new Watcher(vm, item, () => { _this.compileText(node, vm, arr) })
        })
      }
      if (node.nodeType === 1) {
        // 是否文dom节点
        let attrs = node.attributes
        Array.from(attrs).forEach(attr => {
          let attrName = attr.name
          let attrValue = attr.value
          if (this.isDirective(attrName)) {
            let type = attrName.substring(2)
            if (this.isEvent(type)) {
              // 事件指令 将执行methods中的方法
              let ev = type.substring(3)
              this.handleEvent(ev, node, vm, attrValue)
            } else {
              // 非事件指令 具体是model还是其他指令在handleOtherDirective详细处理
              this.handleOtherDirective(type, node, vm, attrValue)
            }
          }
        })
      }
    })
  },
  handleEvent: function (ev, node, vm, attrValue) {
    vm.$methods && vm.$methods[attrValue] && node.addEventListener(ev, vm.$methods[attrValue].bind(vm), false)
  },
  handleOtherDirective: function (type, node, vm, attrValue) {
    Object.keys(compileUtil).forEach(key => {
      if (key === type) {
        compileUtil[type](node, vm, attrValue)
      }
    })
  },
  isDirective: function (attrName) {
    return attrName.indexOf('v-') === 0
  },
  isEvent: function (type) {
    return type.indexOf('on:') === 0
  },
  compileText: function (node, vm, arr) {
    let content = ''
    arr.forEach(exp => {
      let reg = /\{\{(\s*[a-zA-Z_]+(\w|\.)*\s*)\}\}/g
      let keys = reg.exec(exp)[1]
      let val = this.compileKeys(keys, vm)
      content += val
    })
    node.textContent = content
  },
  compileKeys: function (keys, vm) {
    let data = vm._data
    let key_arr = keys.split('.')
    key_arr.forEach(key => {
      data = data[key]
    })
    return data
  }
}
//view层的处理主要是对{{}}和指令的处理；而对于指令则需要按照不同指令进行不同处理，如v-model, v-on...

function Watcher(vm, keys, cb) {
  //订阅器
  this.cb = cb
  this.vm = vm
  this.keys = keys
  Dep.target = this
  let reg = /\{\{(\s*[a-zA-Z_]+(\w|\.)*\s*)\}\}/g
  keys = reg.exec(keys)[1]
  let arr = keys.split('.')
  let data = vm
  arr.forEach(key => {
    data = data[key];// 触发订阅器的添加
  })
  Dep.target = null
}

Watcher.prototype.update = function () {
  let reg = /\{\{(\s*[a-zA-Z_]+(\w|\.)*\s*)\}\}/g
  let arr = reg.exec(this.keys)[1].split('.')
  let val = this.vm
  arr.forEach(key => {
    val = val[key]
  })
  this.cb();// 数据变化后调用回调函数重新赋值
}