'use strict'

let Font = require('css-font')
let createRegl = require('regl')
let pick = require('pick-by-alias')
let createGl = require('gl-util/context')
let WeakMap = require('es6-weak-map')
let rgba = require('color-normalize')
let fontAtlas = require('font-atlas')
let extend = require('object-assign')
let pool = require('typedarray-pool')

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
				attribute float offset;
				uniform float fontSize;
				uniform vec4 viewport;
				varying vec2 charCoord;
				void main () {
					charCoord = vec2(offset, 50);

					vec2 position = charCoord / viewport.zw;
					gl_Position = vec4(position * 2. - 1., 0, 1);

					gl_PointSize = fontSize;
				}`,

				frag: `
				precision mediump float;
				uniform sampler2D atlas;
				uniform vec4 color, viewport;
				uniform float fontSize, atlasFontSize;
				uniform vec2 atlasSize;
				varying vec2 charCoord;
				void main () {
					vec4 fontColor = color;
					vec2 uv = (gl_FragCoord.xy - (charCoord - fontSize*.5)) / atlasFontSize;
					fontColor.a *= texture2D(atlas, uv).g;
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
					char: regl.this('charBuffer'),
					offset: regl.this('offsetBuffer')
				},
				uniforms: {
					atlasSize: Text.atlasSize,
					atlasFontSize: Text.atlasFontSize,
					atlas: regl.this('atlasTexture'),
					viewport: regl.this('viewportArray'),
					color: regl.this('color'),
					fontSize: regl.this('fontSize')
				},
				primitive: 'points',
				count: regl.this('count'),
				viewport: regl.this('viewport')
			})

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
		if (o.viewport != null) {
			this.viewport = parseRect(o.viewport)
			this.viewportArray = [this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height]
		}
		if (this.viewport == null) {
			this.viewport = {
				x: 0, y: 0,
				width: this.gl.drawingBufferWidth,
				height: this.gl.drawingBufferHeight
			}
			this.viewportArray = [this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height]
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
			nfont.size = Text.atlasFontSize
			this.atlasFont = Font.stringify(nfont)

			if (!this.atlasCache[this.atlasFont]) {
				let atlas = fontAtlas({
					font: this.atlasFont,
					chars: [],
					shape: [Text.atlasSize, Text.atlasSize],
					step: [Text.atlasFontSize, Text.atlasFontSize]
				})

				this.atlasCache[this.atlasFont] = {
					font: this.font,
					canvas: atlas,
					context: atlas.getContext('2d'),
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
			let newChars = 0
			let charIds = pool.mallocUint8(this.count)
			let offsets = pool.mallocFloat(this.count)

			// detect new characters and calculate offsets
			for (let i = 0; i < this.count; i++) {
				let char = this.text.charAt(i)

				if (!atlas.ids[char]) {
					atlas.ids[char] = atlas.chars.length
					atlas.chars.push(char)
					atlas.widths[char] = atlas.context.measureText(char).width

					newChars++
				}

				charIds[i] = atlas.ids[char]
				offsets[i] = !i ? 0 : (offsets[i - 1] + atlas.widths[char])
			}

			this.charBuffer({data: charIds, type: 'uint8', usage: 'stream'})
			this.offsetBuffer({data: offsets, type: 'float', usage: 'stream'})
			pool.freeUint8(charIds)
			pool.freeFloat(offsets)

			// render new characters
			if (newChars) {
				atlas.canvas = fontAtlas({
					font: this.atlasFont,
					chars: atlas.chars,
					shape: [Text.atlasSize, Text.atlasSize],
					step: [Text.atlasFontSize, Text.atlasFontSize]
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


Text.atlasSize = 1024
Text.atlasFontSize = 128


module.exports = Text
