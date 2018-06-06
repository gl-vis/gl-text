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
			let atlasCache = {}

			// draw texture method
			let draw = regl({
				vert: `
				precision mediump float;
				varying vec2 uv;
				attribute float offset;
				uniform float fontSize;
				uniform vec4 viewport;
				void main () {
					gl_PointSize = fontSize;
					gl_Position = vec4(offset / 1000., 0, 0, 1);
				}`,

				frag: `
				precision mediump float;
				uniform sampler2D texture;
				uniform vec4 color;
				varying vec2 uv;
				void main () {
					vec4 fontColor = color;
					gl_FragColor = color;
					// fontColor.a *= texture2D(texture, uv).g;
					// gl_FragColor = fontColor;
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
					char: regl.this('charBuffer'),
					offset: regl.this('offsetBuffer')
				},
				uniforms: {
					texture: regl.this('atlasTexture'),
					viewport: regl.this('viewport'),
					color: regl.this('color'),
					fontSize: regl.this('fontSize')
				},
				primitive: 'points',
				count: regl.this('count')
			})

			// FIXME: in chrome font alpha depends on color seemingly to compensate constrast
			// but that makes for inconsistency of font color

			shader = { regl, draw, atlasCache }

			cache.set(this.gl, shader)
		}

		this.render = shader.draw.bind(this)
		this.regl = shader.regl
		this.atlasCache = shader.atlasCache

		this.charBuffer = this.regl.buffer({type: 'uint8', usage: 'stream'})
		this.offsetBuffer = this.regl.buffer({type: 'float', usage: 'stream'})

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

			// update font atlas
			let nfont = extend({}, o.font)
			nfont.size = Text.atlasCacheFontSize
			this.atlasFont = Font.stringify(nfont)

			if (!this.atlasCache[this.atlasFont]) {
				let atlas = fontAtlas({
					font: this.atlasFont,
					chars: [],
					shape: [Text.atlasCacheWidth, Text.atlasCacheWidth],
					step: [Text.atlasCacheFontSize * 2, Text.atlasCacheFontSize * 2]
				})

				this.atlasCache[this.atlasFont] = {
					font: this.font,
					canvas: atlas,
					texture: this.regl.texture(),
					widths: {},
					ids: {},
					chars: []
				}
			}

			this.atlas = this.atlasCache[this.atlasFont]
			this.atlasTexture = this.atlas.texture
			this.fontSize = parseFloat(this.font.size || 16)
		}

		if (o.text) {
			this.text = o.text
			this.count = o.text.length

			let atlas = this.atlas
			let ctx = atlas.canvas.getContext('2d')
			let newChars = 0
			let charIds = new Uint8Array(this.count)
			let offsets = new Float32Array(this.count)

			// detect new characters and calculate offsets
			for (let i = 0; i < this.count; i++) {
				let char = this.text.charAt(i)

				if (!atlas.ids[char]) {
					atlas.ids[char] = atlas.chars.length
					atlas.chars.push(char)
					atlas.widths[char] = ctx.measureText(char).width

					newChars++
				}

				charIds[i] = atlas.ids[char]
				offsets[i] = !i ? 0 : (offsets[i - 1] + atlas.widths[char])
			}

			this.charBuffer({data: charIds, type: 'uint8', usage: 'stream'})
			this.offsetBuffer({data: offsets, type: 'float', usage: 'stream'})

			// render new characters
			if (newChars) {
				atlas.canvas = fontAtlas({
					font: this.atlasFont,
					chars: atlas.chars,
					shape: [Text.atlasCacheWidth, Text.atlasCacheWidth],
					step: [Text.atlasCacheFontSize, Text.atlasCacheFontSize]
				})
				atlas.texture(atlas.canvas)
			}
		}

		if (o.color) {
			this.color = rgba(o.color)
		}
		if (!this.color) this.color = [0,0,0,1]
	}
}


Text.atlasCacheWidth = 1024
Text.atlasCacheFontSize = 128


module.exports = Text
