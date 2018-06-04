'use strict'

var font = require('css-font')
var createRegl = require('regl')
var pick = require('pick-by-alias')
var createGl = require('gl-util/context')
var WeakMap = require('es6-weak-map')

var cache = new WeakMap


module.exports = class Text {
	constructor (o) {
		this.gl = createGl(o)

		var shader = cache.get(this.gl)

		if (!shader) {
			var regl = createRegl({gl: this.gl})

			// text texture cache
			let fontCache = {}

			// canvas2d for rendering text fragment textures
			let fontCanvas = document.createElement('canvas')

			// draw texture method
			let draw = regl({
				vert: `
				precision mediump float;
				attribute vec2 position;
				varying vec2 uv;
				void main () {
					uv = vec2(1. - position.s, position.t);
					gl_Position = vec4(1.0 - 2.0 * position, 0, 1);
				}`,
				frag: `
				precision mediump float;
				uniform sampler2D texture;
				varying vec2 uv;
				void main () {
					gl_FragColor = texture2D(texture, uv);
				}`,

				attributes: { position: [-2,0, 0,-2, 2,2] },
				uniforms: {
					texture: regl.this('texture'),
					viewport: regl.this('viewport')
				},
				count: 3
			})

			shader = { regl, draw, fontCache, fontCanvas }

			cache.set(this.gl, shader)
		}

		this.render = shader.draw.bind(this)
		this.shader = shader

		this.update(o)
	}

	update (o) {
		if (typeof o === 'string') o = { text: o }

		o = pick(o, {
			font: 'font fontFace fontface typeface cssFont css-font',
			text: 'text value symbols',
			align: 'align alignment textAlign textbaseline',
			baseline: 'baseline textBaseline textbaseline',
			direction: 'dir direction textDirection',
			color: 'color colour fill fill-color fillColor textColor textcolor',
			viewport: 'vp viewport viewBox viewbox viewPort',
			opacity: 'opacity alpha transparency visible visibility opaque'
		}, true)

		if (o.opacity != null) this.opacity = parseFloat(o.opacity)
		if (o.viewport != null) this.viewport = parseRect(o.viewport)

		if (this.viewport == null) {
			this.viewport = { x: 0, y: 0,
				width: this.gl.drawingBufferWidth,
				height: this.gl.drawingBufferHeight
			}
		}

		if (o.baseline) this.baseline = o.baseline
		if (o.direction) this.direction = o.direction
		if (o.align) this.align = o.align
		if (o.text) this.text = o.text

		// normalize font caching string
		if (typeof o.font === 'string') o.font = font.parse(o.font)
		if (o.font) this.font = font.stringify(o.font)

		if (o.text) {
			if (!this.shader.fontCache[this.font]) this.shader.fontCache[this.font] = {}

			if (this.shader.fontCache[this.font][this.text]) {
				this.texture = this.shader.fontCache[this.font][this.text]
			}
			else {
				this.texture = this.shader.fontCache[this.font][this.text] = this.createTexture()
			}
		}
	}

	// return regl texture with rendered text with a font
	createTexture () {
		let canvas = this.shader.fontCanvas
		let ctx = canvas.getContext('2d')

		ctx.font = this.font
		// ctx.textAlign = this.align
		// ctx.textBaseline = this.baseline
		// ctx.direction = this.direction
		// ctx.fillColor = this.color || 'black'

		// let metric = ctx.measureText(this.text)

		// canvas.width = metric.width

		// ctx.fillText(this.text, 0, 0)
		ctx.font = '48px serif';
		ctx.fillText('Hello world', 10, 50);

		// document.body.appendChild(canvas)

		return this.shader.regl.texture(canvas)
	}
}

