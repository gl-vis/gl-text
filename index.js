'use strict'

import parseFont from 'parse-css-font'
// import stringifyFont from 'stringify-css-font'
import GlComponent from '../gl-component'
import createRegl from 'regl'
import pick from 'pick-by-alias'


class Text extends GlComponent {
	constructor (o) {
		super(o)

	}

	createShader () {
		this.regl = createRegl({
			gl: this.gl
		})

		// text texture cache
		let fontCache = {}

		// canvas2d for rendering text fragment textures
		let fontCanvas = document.createElement('canvas')

		// shared draw method
		let draw = this.regl({
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
			uniforms: { texture: this.regl.prop('texture') },
			count: 3
		})

		return { draw, fontCache, fontCanvas }
	}

	update (o) {
		if (typeof o === 'string') o = { text: o }

		// inits viewport, opacity
		super.update(o)

		o = pick(o, {
			font: 'font fontFace fontface typeface cssFont css-font',
			text: 'text value symbols',
			align: 'align alignment textAlign textbaseline',
			baseline: 'baseline textBaseline textbaseline',
			direction: 'dir direction textDirection',
			color: 'color colour fill fill-color fillColor textColor textcolor'
		}, true)

		if (o.baseline) this.baseline = o.baseline
		if (o.direction) this.direction = o.direction
		if (o.align) this.align = o.align
		if (o.text) this.text = o.text


		if (typeof o.font === 'string') o.font = parseFont(o.font)

		if (o.font) this.font = stringifyFont(o.font)

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

		// ctx.font = this.font || 'sans-serif'
		// ctx.textAlign = this.align
		// ctx.textBaseline = this.baseline
		// ctx.direction = this.direction
		// ctx.fillColor = this.color || 'black'

		// let metric = ctx.measureText(this.text)

		// canvas.width = metric.width

		// ctx.fillText(this.text, 0, 0)
		ctx.font = '48px serif';
		ctx.fillText('Hello world', 10, 50);

		document.body.appendChild(canvas)

		return this.regl.texture(canvas)
	}

	draw () {
		this.shader.draw(this)
	}
}


// TODO: how to do that in ES6
module.exports = Text



function stringifyFont (o) {
	if (!o) return ''
	return `${o.family}`
}
