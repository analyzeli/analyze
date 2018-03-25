const Vue = require('vue')
const VueMaterial = require('vue-material')
const Chartist = require('vue-chartist')

const appOptions = require('./app.vue')

// Vue plugins
Vue.use(VueMaterial)
Vue.use(Chartist)

// Initialize app
var app = new Vue({
  el: '#app',
  render: function (createElement) {
    return createElement(appOptions)
  }
})
