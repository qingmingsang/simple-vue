Vue的核心思想：响应式数据渲染

```
<div>
    <input type="text" id="input-msg">
    <p id="output-msg"></p>
</div>

<script>
    var inputMsg = document.getElementById('input-msg'),
        outputMsg = document.getElementById('output-msg');


    var obj = {
        msg: 'hello'
    };

    var key = 'msg';
    
    var val = obj[key];
    

    Object.defineProperty(obj, key, {
        enumerable: true,
        configurable: true,
        set: function (newValue) {
            val = newValue;

            outputMsg.innerText = obj[key];
        },

        get: function () {
            console.log('getter');
            return val;
        }
    });


    inputMsg.addEventListener('input', function (event) {
        var newVal = event.target.value;
        obj[key] = newVal;
    });
    
</script>
```
在上面的代码中，我们通过监听input的input事件来去改变obj[key]的值，使obj[key]的值始终等于用户输入的值，当obj[key]的值因为用户的输入而发生了改变的时候，会激活Object.defineProperty中的setter事件，然后我们获取到最新的obj[key]的值并把它赋值给outputMsg。这样当我们在input中进行输入的时候，`<p>`中的值也会跟随我们的输入变化。这种通过Object.defineProperty来监听数据变化的方式就是Vue中数据响应的核心思想。


# 思路整理
整个框架的思路被分成三大块。

首先就是视图渲染，我们在html或者`<template></template>`中进行html内容编写的时候，往往是这样：
```
<div id="app">
    <input type="text" v-model='msg'>
    <div>
        <p>{{msg}}</p>
    </div>
</div>
```
其中的`v-model='msg'` 和 `{{msg}}` 浏览器是无法解析的，那么我们就需要把 浏览器不认识的内容转化为浏览器可以解析的内容，在Vue中，Vue通过虚拟DOM（VNode）描述真实DOM，然后通过_update来进行具体渲染。
这里不去描述这个VNode直接通过_update方法来对DOM进行渲染操作，这个动作是发生在Compile中。Compile会解析我们的具体指令，并重新渲染DOM。

其次是监听数据的变化，在最初的例子中我们已经知道我们可以通过Object.defineProperty(obj, prop, descriptor)来实现数据的监听，那么就需要一个Observer类来进行数据劫持的工作，这时Observer承担的就是发布者的工作。当我们通过Observer来监听到数据变化之后，我们需要通知我们的观察者，但是对于我们的发布者来说，它并不知道谁是这个观察者，这个观察者是一个还是多个？所以这个时候，就需要有一个人来负责去收集这些依赖的工作，这个人就是Dep（Dependency），我们通过Dep来去通知观察者Watcher，Watcher订阅Dep，Dep持有Watcher，两者互相依赖形成一个消息中转站。当Watcher接收到消息，需要更改视图的时候，那么就会发布具体的消息根据具体指令的不同（Directive）来执行具体的操作Patch。这就是我们的整个从监听到渲染的过程

最后我们需要把所有的东西整合起来形成一个入口函数，输出给用户方便用户进行调用，就好像Vue中的new Vue({})操作。

## 入口函数

首先我们需要先生成MVue的入口函数，我们仿照Vue的写法，创建一个MVue的类，并获取传入的options。

```
function MVue (options) {
    this.$options = options;
    this._data = options.data || {};
}

MVue.prototype = {
    _getVal: function (exp) {
        return this._data[exp];
    },

    _setVal: function (exp, newVal) {
        this._data[exp] = newVal;
    }
}
```

首先我们实现一个MVue的构造函数，并为它提供了两个私有的原型方法_getVal和_setVal用于获取和设置data中对应key的值。这时我们就可以通过下面的代码来创建对应的MVue实例。
```
var vm = new MVue({
    el: '#app',
    data: {
        msg: 'hello'
    }
});
```
然后我们就可以在MVue的构造函数之中去进行我们的 视图渲染 和 数据监听 的操作。


## 视图渲染
然后我们进行我们的视图渲染，我们再来回顾一下我们需要解析的视图结构
```
<div id="app">
    <input type="text" v-model='msg'>
    <div>
        <p>{{msg}}</p>
    </div>
</div>
```
在这段html之中`v-model`和`{{msg}}`是我们MVue中的自定义指令，这些指令我们的浏览器是无法解析的，所以需要我们把这些指令解析为浏览器可以解析的html代码。以`<p>{{msg}}</p>`为例，当我们声明`data: {msg: 'hello'}`的时候，应解析为`<p>hello</p>`。

我们的模板解析的操作是通过compile.js来完成的。
```
function Compile (vm, el) {
    this.$vm = vm;
    el = this.$el = this.isElementNode(el) ? el : document.querySelector(el);

    if (!el) {
        return;
    }

    this._update(el);
};

Compile.prototype = {

    /**
     * Vue中使用vm._render先根据真实DOM创建了虚拟DOM，然后在vm._update把虚拟DOM转化为真实DOM并渲染,
     * 我们这里没有虚拟DOM，所以直接通过createElm方法创建一个fragment用以渲染
     */
    _update: function (el) {
        this.$fragment = document.createDocumentFragment();
        // 复制el的内容到创建的fragment
        this.createElm(el);
        // 把解析之后的fragment放入el中，此时fragment中的所有指令已经被解析为具体数据
        el.appendChild(this.$fragment);
    },

    /**
     * 创建新的DOM 用来替换 原DOM
     */
    createElm: function (node) {
        var childNode = node.firstChild;
        if (childNode) {
            this.$fragment.appendChild(childNode);
            this.createElm(node);
        }
    }
} 
```
声明了一个Compile的构造方法，并调用了它的_update原型函数，在_update中声明了一个fragment用于承载解析之后的模板内容，通过createElm的递归调用获取el中的元素，并把获取出的元素放入fragment中，最后把fragment添加到el里面。至此我们已经成功的获取到了el中的元素，并把这些元素重新规制。

接下来就需要对获取出来的元素进行解析操作，其实就是对`v-model`和`{{*}}`等指令进行解析，这个解析的时机应该在 遍历出所有的元素之后，添加fragment到el之前。我们看一下解析DOM的代码：
```
Compile.prototype = {
    _update: function (el) {
        ...
        // 解析被创建完成的fragment，此时fragment已经拥有了el内所有的元素
        this.compileElm();
        ...
    },
    ...
    /**
     * 对DOM进行解析
     */
    compileElm: function (childNodes) {
        var reg = /\{\{(.*)\}\}/;
        if (!childNodes) {
            childNodes = this.$fragment.childNodes;
        }
        
        [].slice.call(childNodes).forEach(node => {
            if (node.childNodes.length > 0) {
                // 迭代所有的节点
                this.compileElm(node.childNodes);
            }
    
            // 获取elementNode节点
            if (this.isElementNode(node)) {
                if (reg.test(node.textContent)) {
                    // 匹配 {{*}}
                    this.compileTextNode(node, RegExp.$1);
                } 
                // 匹配elementNode
                this.compileElmNode(node);
                
            } 
        });
    },
    /**
     * 解析elementNode，获取elm的所有属性然后便利，检查属性是否属于已经注册的指令,
     * 如果不是我们的自定义指令，那么就不需要去处理它了
     * 如果是已注册的指令，我们就交给directive去处理。（演示只有一个v-model）
     */
    compileElmNode: function (node) {
        var attrs = [].slice.call(node.attributes),
            $this = this;
    
        attrs.forEach(function (attr) {
            if (!$this.isDirective(attr.nodeName)) {
                return;
            }
    
            var exp = attr.value;
            // 匹配v-model指令
            directives.model($this.$vm, node, exp);
            // 去掉自定义指令
            node.removeAttribute(attr.name);
        });
    },
    /**
     * 解析{{*}}
     */
    compileTextNode: function (node, exp) {
        directives.text(this.$vm, node, exp);
    },
    /**
     * 判断是否是已注册的指令，这里就判断是否包含 v-
     */
    isDirective: function (attrNodeName) {
        return attrNodeName.indexOf('v-') === 0;
    },
    /**
     * 判断elmNode节点
     */
    isElementNode: function (node) {
        return node.nodeType === 1;
    }
}
```
由上面的代码可以看出，解析的操作主要在compileElm方法中进行，这个方法首先获取到fragment的childNodes，然后对childNodes进行了forEach操作，如果其中的node还有子节点的话，则会再次调用compileElm方法，然后解析这个node，如果是一个ElementNode节点，则再去判断是否为`{{*}}`双大括号结构，如果是则会执行compileTextNode来解析`{{*}}`，然后通过compileElmNode来解析ElmNode中的指令。

compileTextNode中的实现比较简单，主要是调用了directives.text(vm, node, exp)进行解析。

compileElmNode首先把node中所有的属性转成了数组并拷贝给了attrs，然后对attrs进行遍历获取其中的指令，因为我们目前只有一个v-model指令，所以我们不需要在对指令进行判断，可以直接调用directives.model(vm, node, exp)来进行v-model的指令解析，最后在DOM中删除我们的自定义指令。

至此我们就复制了el的所有元素，并根据不同的指令把它们交由directives中对应的指令解析方法进行解析，这就是我们compile.js中所做的所有事情。接下来我们看一下directives是如何进行指令解析操作的
```
// directives.js

/**
 * 指令集和
 * 
 * v-model
 */
var directives = {
    /**
     * 链接patch方法，将指令转化为真实的数据并展示
     */
    _link: function (vm, node, exp, dir) {
        var patchFn = patch(vm, node, exp, dir);
        patchFn  && patchFn(node, vm._getVal(exp));
    },

    /**
     * v-model事件处理，这里的v-model只针对了<input type='text'> 
     */
    model: function (vm, node, exp) {
        this._link(vm, node, exp, 'model');

        var val = vm._getVal(exp);
        node.addEventListener('input', function (e) {
            var newVal = e.target.value;
            if (newVal === val) return;
            vm._setVal(exp,newVal);
            val = newVal;
        });
    },

    /**
     * {{}}事件处理
     */
    text: function (vm, node, exp) {
        this._link(vm, node, exp, 'text');
    }
}
```
上面的代码我们可以看出，我们首先定义了一个directives变量，它包含了_link、model、text三个指令方法，其中_link为私有方法，model、text为公开的指令方法，关于_link我们最后在分析，我们先来看一下model。

model指令方法对应的为v-model指令，它接受三个参数，vm为MVue实例，node为绑定该指令的对应节点，exp为绑定数据的key。先不去管this._link的调用，先想一下在index.html中对于v-model的使用，把`v-model='msg'`绑定到了input标签上，意为当我们在input上进行输入的时候msg始终等于我们输入的值。那么在model指令方法中所要做的事情就很明确了，首先通过`vm._getVal(exp);`获取到msg当前值，然后监听了node的input事件，获取当前用户输入的最新值，然后通过`vm._setVal(exp,newVal)`配置到`vm._data`中，最后通过`val = newVal`重新设置val的值。

然后是text指令方法，这个方法直接调用了this._link，并且在model指令方法中也调用了this._link，那么来看一下_link的实现。
在_link中，他接收四个参数，其中dir为指令代码，然后它调用了一个patch方法，获取到了一个patchFn的变量，这个patch方法位于patch.js中。
```
// patch.js

/**
 * 更改node value，在编译之前，替换 v-model  {{*}} 为真实数据
 * @param {*} vm 
 * @param {*} node 
 * @param {*} exp 
 * @param {*} dir 
 */
function patch (vm, node, exp, dir) {
    switch (dir) {
        case 'model':
        /**
         * input / textear
         */
        return function (node , val) {
            node.value = typeof val === 'undefined' ? '' : val;
        }
        case 'text':
        /**
         * {{*}}
         */
        return function (node , val) {
            node.textContent = typeof val === 'undefined' ? '' : val;
        }
    }
}
```
patch的方法实现比较简单，它首先去判断了传入的指令，然后根据不同的指令返回了不同的函数。比如在model指令方法中，因为只支持input、 textarea，所以我们接收到的node只会是它们两个中的一个，然后我们通过`node.value = val`来改变node中的value。

在directives.js中获取到了patch的返回函数patchFn，然后执行patchFn。至此我们的模板已经被解析为浏览器可以读懂的html代码。
```
<div id="app">
   <input type="text">
   <div>
       <p>hello</p>
   </div>
</div>
```

## 数据监听实现
根据上面的 思路整理 想一下这个数据监听应该如何去实现？知道了应该在observer里面去实现它，但是具体应该怎么做呢？

再来明确一下目标，希望 通过observer能够监听到数据data的变化，当调用data.msg或者`data.msg = '123'`的时候，会分别激活getter或者setter方法。那么我们就需要对整个data进行监听，当我们获取到data对象之后，来遍历其中的所有数据，并分别为它们添加上getter和setter方法。
```
// observer.js

function observer (value) {
    if (typeof value !== 'object') {
        return;
    }

    var ob = new Observer(value);
}


function Observer (data) {
    this.data = data;
    this.walk();
}

Observer.prototype = {

    walk: function () {
        var $this = this;
        var keys = Object.keys(this.data);
        keys.forEach(function (key) {
            $this.defineReactive(key, $this.data[key]);
        });
    },

    defineReactive: function (key, value) {
        var dep = new Dep();
        Object.defineProperty(this.data, key, {
            enumerable: true,
            configurable: true,
            set: function (newValue) {
                if (value === newValue) {
                    return;
                }
                value = newValue;
                dep.notify();
            },

            get: function () {
                dep.depend();
                return value;
            }
        });
    },
}
```
在observer.js中我们通过`observer (value)`方法来生成Observer对象，其中传入的value为`data: {msg: 'hello'}`。然后调用Observer的原型方法walk，遍历data调用defineReactive，通过Object.defineProperty为每条数据都添加上setter、getter监听，同时我们声明了一个Dep对象，这个Dep对象会负责收集依赖并且派发更新。大家结合我们的思路整理想一下，我们应该在什么时候去收集依赖？什么时候去派发更新？

当用户通过input进行输入修改数据的时候，我们是不是应该及时更新视图？所以在setter方法被激活的时候，我们应该调用`dep.notify()`方法，用于派发更新事件。

当我们的数据被展示出来的时候，也就是在getter事件被激活的时候，我们应该去收集依赖，也就是调用`dep.depend()`方法。

```
// Dep.js

var uid = 0;
function Dep () {
    // 持有的watcher订阅者
    this.subs = [];
    this.id = uid++;
}

Dep.prototype = {
    // 使dep与watcher互相持有
    depend () {
        // Dep.target为watcher实例
        if (Dep.target) {
            Dep.target.addDep(this)
        }
    },
    // 添加watcher
    addSub: function (sub) {
        this.subs.push(sub);
    },
    // 通知所有的watcher进行更新
    notify: function () {
        this.subs && this.subs.forEach(function (sub) {
            sub.update();
        });
    }
}
```
Dep.js的实现比较简单，它主要是就负责收集依赖（watcher）并且派发更新（`watcher.update()`），我们可以看到Dep首先声明了subs用于保存订阅了Dep的watcher实例，然后给每个Dep实例创建了一个id，然后我们为Dep声明了三个原型方法，当调用notify的时候，Dep回去遍历所有的subs然后调用他的`update()`方法，当调用depend的时候会调用watcher的addDep方法使Dep与Watcher互相持有。其中的Dep.target和sub都为Watcher实例。

```
// watcher

function Watcher (vm, exp, patchFn) {
    this.depIds = {};
    this.$patchFn = patchFn;
    this.$vm = vm;
    this.getter = this.parsePath(exp)
    this.value = this.get();
}

Watcher.prototype = {
    // 更新
    update: function () {
        this.run();
    },
    // 执行更新操作
    run: function () {
        var oldVal = this.value;
        var newVal = this.get();
        if (oldVal === newVal) {
            return;
        }
        this.$patchFn.call(this.$vm, newVal);
    },
    // 订阅Dep
    addDep: function (dep) {
        if (this.depIds.hasOwnProperty(dep.id)) {
            return;
        }
        dep.addSub(this);
        this.depIds[dep.id] = dep;
    },
    // 获取exp对应值，这时会激活observer中的get事件
    get: function () {
        Dep.target = this;
        var value = this.getter.call(this.$vm, this.$vm._data);
        Dep.target = null;
        return value;
    },
    /**
     * 获取exp的对应值，应对a.b.c
     */
    parsePath: function (path) {
        var segments = path.split('.');

        return function (obj) {
          for (let i = 0; i < segments.length; i++) {
            if (!obj) return
            obj = obj[segments[i]]
          }
          return obj
        }
      }
}
```
在Watcher.js中它直接接收了patchFn，patchFn是更改node value，在编译之前，替换 v-model 、` {{*}} `为真实数据的方法，在Watcher.js接收了patchFn，并把它赋值给this.$patchFn，当我们调用this.$patchFn的时候，就会改变我们的DOM渲染。

然后我们调用parsePath用于解析对象数据，并返回一个解析函数，然后把它赋值给this.getter。最后我们调用get()方法，在get()中我们给Dep.target持有了Watcher，并激活了一次getter方法，使我们在observer中监听的getter事件被激活，会调用dep.depend()方法，然后调用watcher.addDep(dep)，使Dep与Watcher互相持有，相互依赖。

然后我们看一下update方法的实现，我们知道当数据的setter事件被激活的时候，会调用dep.notify(),dep.notify()又会遍历所有的订阅watcher执行update方法，那么在upadte方法中，直接执行了this.run，在run()方法中，首先获取了 当前watcher所观察的exp的改变前值oldVal和修改后值newVal，然后通过patchFn去修改DOM。

以上就是我们整个数据监听的流程，它首先通过observer来监听数据的变化，然后当数据的getter事件被激活的时候，调用dep.depend()来进行依赖收集，当数据的setter事件被激活的时候，调用dep.notify()来进行派发更新，这些的具体操作都是在我们的观察者watcher中完成的。


## 整合MVue
最后我们就需要把我们的 视图渲染 和 数据监听 链接起来，那么这个连接的节点应该在哪里呢？我们再来捋一下我们的流程。

当用户编写了我们的指令代码
```
<div id="app">
    <inputtype="text" v-model='msg'>
    <div>
        <p>{{msg}}</p>
    </div>
</div>
```
的时候，我们通过Compile进行解析，当发现了我们的自定义指令v-model、`{{*}}`的时候，会进行directives进行指令解析，其中监听的用户的输入事件，并调用了vm._setVal()方法，从而会激活在observer中定义的setter事件，setter会进行派发更新的操作，调用dep.notify()方法，然后便利subs调用update方法。

结合上面的描述，我们应该在两个地方去完成连接节点。首先是在调用vm._setVal()方法的时候，我们需要保证observer中的setter事件可以被激活，那么我们最好在入口函数中去声明这个observer：
```
function MVue (options) {
    this.$options = options;
    this._data = options.data || {};

    observer(this._data);

    new Compile(this, this.$options.el);
}

MVue.prototype = {
    _getVal: function (exp) {
        return this._data[exp];
    },

    _setVal: function (exp, newVal) {
        this._data[exp] = newVal;
    }
}
```
然后当setter事件被激活之前，我们需要初始化完成watcher使其拥有vm、exp、patchFn,那么最好的时机应该在获取到patchFn这个返回函数的时候，所以应该在：
```
var directives = {

    _bind: function (vm, exp, patchFn) {
        new Watcher(vm,exp, patchFn);
    },

    /**
     * 链接patch方法，将指令转化为真实的数据并展示
     */
    _link: function (vm, node, exp, dir) {
        var patchFn = patch(vm, node, exp, dir);
        patchFn  && patchFn(node, vm._getVal(exp));

        this._bind(vm, exp, function (value) {
            patchFn  && patchFn(node, value);
        });
    },
    ...
}
```
通过_bind方法来去初始化watcher。



