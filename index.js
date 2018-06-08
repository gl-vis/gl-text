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
				attribute float width, offset, char;
				uniform float fontSize, fontRatio;
				uniform vec4 viewport;
				varying vec2 charCoord;
				varying float charId;
				void main () {
					charId = char;
					charCoord = vec2(offset / 5., 50);

					vec2 position = charCoord / viewport.zw;
					gl_Position = vec4(position * 2. - 1., 0, 1);

					gl_PointSize = fontSize;
				}`,

				frag: `
				precision mediump float;
				uniform sampler2D atlas;
				uniform vec4 color, viewport;
				uniform float fontSize, atlasFontSize;
				uniform float atlasSize;
				varying float charId;
				varying vec2 charCoord;
				void main () {
					vec4 fontColor = color;
					vec2 uv = gl_FragCoord.xy - charCoord + fontSize * .5;
					uv.y = fontSize - uv.y;
					uv = (uv / fontSize) * atlasFontSize / atlasSize;
					uv.x += charId * atlasFontSize / atlasSize;
					fontColor.a *= texture2D(atlas, uv).g + .1;
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
				stencil: {enable: false},
				depth: {enable: false},

				attributes: {
					char: regl.this('charBuffer'),
					offset: {
						offset: 4,
						stride: 8,
						buffer: regl.this('sizeBuffer')
					},
					width: {
						offset: 0,
						stride: 8,
						buffer: regl.this('sizeBuffer')
					}
				},
				uniforms: {
					atlasSize: Text.atlasSize,
					atlasFontSize: Text.atlasFontSize,
					fontSize: regl.this('fontSize'),
					fontRatio: regl.this('fontRatio'),
					atlas: regl.this('atlasTexture'),
					viewport: regl.this('viewportArray'),
					color: regl.this('color'),
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
		this.sizeBuffer = this.regl.buffer({type: 'float', usage: 'stream'})

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
			this.fontSize = parseFloat(this.font.size || 24)
			this.fontRatio = this.fontSize / Text.atlasFontSize
		}

		if (o.text) {
			this.text = o.text
			this.count = o.text.length

			let atlas = this.atlas
			let newChars = 0
			let charIds = pool.mallocUint8(this.count)
			let sizeData = pool.mallocFloat(this.count * 2)

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
				// char width
				sizeData[i * 2] = atlas.widths[char]

				let offset = 0;
				if (i) {
					let prevWidth = sizeData[i * 2 - 2]
					let currWidth = sizeData[i * 2]
					let prevOffset = sizeData[i * 2 - 1]
					offset = prevOffset + prevWidth * .5 + currWidth * .5;
					sizeData[i * 2 + 1] = offset
				}
			}

			this.charBuffer({data: charIds, type: 'uint8', usage: 'stream'})
			this.sizeBuffer({data: sizeData, type: 'float', usage: 'stream'})
			pool.freeUint8(charIds)
			pool.freeFloat(sizeData)

			// render new characters
			if (newChars) {
				atlas.canvas = fontAtlas({
					font: this.atlasFont,
					chars: atlas.chars,
					shape: [Text.atlasSize, Text.atlasSize],
					step: [Text.atlasFontSize, Text.atlasFontSize]
				})
				atlas.texture({
					min: 'linear',
					mag: 'linear',
					data: atlas.canvas,
				})
				// document.body.appendChild(atlas.canvas)
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
