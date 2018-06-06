'use strict'

let Font = require('css-font')
let createRegl = require('regl')
let pick = require('pick-by-alias')
let createGl = require('gl-util/context')
let WeakMap = require('es6-weak-map')
let rgba = require('color-normalize')
let fontAtlas = require('font-atlas')
let extend = require('object-assign')

let cache = new WeakMap


class Text {
	constructor (o) {
		this.gl = createGl(o)

		let shader = cache.get(this.gl)

		if (!shader) {
			let regl = createRegl({
				gl: this.gl
			})

			// font atlas cache, per-font
			let atlas = {}

			// draw texture method
			let draw = regl({
				vert: `
				precision mediump float;
				attribute vec2 position;
				varying vec2 uv;
				uniform float width;
				uniform vec4 viewport;
				void main () {
					uv = vec2(1. - position.s, position.t);

					gl_Position = vec4(1.0 - 2.0 * position, 0, 1);
				}`,

				frag: `
				precision mediump float;
				uniform sampler2D texture;
				uniform vec4 color;
				varying vec2 uv;
				void main () {
					vec4 fontColor = color;
					fontColor.a *= texture2D(texture, uv).g;
					gl_FragColor = fontColor;
				}`,

				blend: {
					enable: true,
					color: [0,0,0,1],

					func: {
						srcRGB: 'src alpha',
						dstRGB: 'one minus src alpha',
						srcAlpha: 'one minus dst alpha',
						dstAlpha: 'one'
					}
				},

				attributes: {
					position: [-2,0, 0,-2, 2,2]
				},
				uniforms: {
					texture: regl.this('texture'),
					viewport: regl.this('viewport'),
					color: regl.this('color'),
					width: regl.this('width')
				},
				count: 3
			})

			// FIXME: in chrome font alpha depends on color seemingly to compensate constrast
			// but that makes for inconsistency of font color

			shader = { regl, draw, atlas}

			cache.set(this.gl, shader)
		}

		this.render = shader.draw.bind(this)
		this.regl = shader.regl
		this.atlas = shader.atlas

		this.update(o)
	}

	update (o) {
		if (typeof o === 'string') o = { text: o }
		else if (!o) o = {}

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
			this.viewport = {
				x: 0, y: 0,
				width: this.gl.drawingBufferWidth,
				height: this.gl.drawingBufferHeight
			}
		}

		if (o.baseline) this.baseline = o.baseline
		if (o.direction) this.direction = o.direction
		if (o.align) this.align = o.align

		// normalize font caching string
		if (typeof o.font === 'string') o.font = Font.parse(o.font)
		if (o.font) {
			this.font = o.font
		}

		if (o.text) {
			this.text = o.text
		}

		if (o.font || o.text) {
			this.updateAtlas(this.font, this.text)
		}

		if (o.color) {
			this.color = rgba(o.color)
		}
		if (!this.color) this.color = [0,0,0,1]
	}

	// make sure text characters are in font atlas
	updateAtlas (font, text) {
		let nfont = extend({}, font)
		nfont.size = Text.atlasFontSize
		let nfontStr = Font.stringify(nfont)

		if (!this.atlas[nfontStr]) {
			let atlas = fontAtlas({
				// hack to support correct fonts
				// TODO: PR for https://github.com/hughsk/font-atlas/issues/1
				size: nfontStr,
				family: ' ',
				chars: [],
				shape: [Text.atlasWidth, Text.atlasWidth],
				step: [Text.atlasFontSize * 2, Text.atlasFontSize * 2]
			})

			let texture = this.regl.texture({width: 1, height: 1})

			this.atlas[nfontStr] = {
				font: font,
				canvas: atlas,
				texture: texture,
				widths: {},
				ids: {},
				chars: []
			}
		}

		let atlas = this.atlas[nfontStr]
		let ctx = atlas.canvas.getContext('2d')

		// extend characters
		let newChars = 0
		for (let i = 0; i < text.length; i++) {
			let char = text.charAt(i)

			if (!atlas.ids[char]) {
				atlas.ids[char] = atlas.chars.length
				atlas.chars.push(char)
				atlas.widths[char] = ctx.measureText(char)

				newChars++
			}
		}

		// render font atlas
		if (newChars) {
			atlas.canvas = fontAtlas({
				// hack to support correct fonts
				// TODO: PR for https://github.com/hughsk/font-atlas/issues/1
				size: nfontStr,
				family: ' ',
				chars: atlas.chars,
				shape: [Text.atlasWidth, Text.atlasWidth],
				step: [Text.atlasFontSize * 2, Text.atlasFontSize * 2]
			})
		}

		document.body.appendChild(atlas.canvas)
	}
}


Text.atlasWidth = 1024
Text.atlasFontSize = 64


module.exports = Text
