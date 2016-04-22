
function Sketch(w, h) {

  this.gl = null
  this.width = w
  this.height = h

  // configurable properties
  this.paused = false
  this.color = [ 255, 0, 0 ]

  // init gui
  this.stats = new Stats()
  this.stats.showPanel(0)
  document.body.appendChild( this.stats.dom );

  this.gui = new dat.GUI()
  this.gui.add(this, 'paused')
    .onChange(_.bind(this.onPauseChanged, this))
  this.gui.addColor(this, 'color')
    .onChange(_.bind(this.onColorChanged, this))

}
_.extend(Sketch.prototype, {
  start: function start() {
    var gl = createContext(this.width, this.height)
    this.gl = gl

    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    this.onColorChanged(this.color)

    this.tick()
  },

  tick: function tick(ts) {
    this.stats.begin()

    this.update(ts)
    this.render(ts)

    this.stats.end()
    if (!this.paused) {
      window.requestAnimationFrame(_.bind(this.tick, this))
    }
  },

  update: function update(ts) {

  },

  render: function render(ts) {
    var gl = this.gl
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  },

  // Internal Methods



  // GUI Callbacks

  onPauseChanged: function onPauseChanged(isPaused) {
    if (!isPaused) {
      this.render()
    }
  },

  onColorChanged: function onColorChanged(color) {
    if (typeof color === 'string') {
      // convert hex strings to int array
      var tokens = [ color.slice(1,3), color.slice(3,5), color.slice(5) ]
      color = _.map(tokens, function(hex) { return parseInt(hex, 16) })
    }
    this.gl.clearColor(
      color[0] / 255.0,
      color[1] / 255.0,
      color[2] / 255.0, 1.0)
  }
})

window.onload = function() {
  var sketch = new Sketch(500, 500)
  sketch.start()
}
