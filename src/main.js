const Vue = require('vue')
const VueMaterial = require('vue-material')
const Highcharts = require('highcharts')
const VueHighcharts = require('vue-highcharts')

const app = require('./app.vue')

// Vue plugins
Vue.use(VueMaterial)
Vue.use(VueHighcharts, { Highcharts })

// Initialize app
const vm = new Vue({
  el: '#app',
  render: function (createElement) {
    return createElement(app)
  }
})

console.log(`Created a Vue app, attached to: #${vm.$el.id}`)
