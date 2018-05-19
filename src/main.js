const Vue = require('vue')
const VueMaterial = require('vue-material')
const Highcharts = require('highcharts')
const VueHighcharts = require('vue-highcharts')
// const Chartist = require('vue-chartist')

const appOptions = require('./app.vue')

// Vue plugins
Vue.use(VueMaterial)
Vue.use(VueHighcharts, { Highcharts })
// Vue.use(Chartist)

// Initialize app
var app = new Vue({
  el: '#app',
  render: function (createElement) {
    return createElement(appOptions)
  }
})
