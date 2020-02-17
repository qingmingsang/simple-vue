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
