'use strict'

let Font = require('css-font')
let createRegl = require('regl')
let pick = require('pick-by-alias')
let createGl = require('gl-util/context')
let WeakMap = require('es6-weak-map')
let rgba = require('color-normalize')
let fontAtlas = require('font-atlas')
let pool = require('typedarray-pool')
let parseRect = require('parse-rect')
let isPlainObj = require('is-plain-obj')
let alru = require('array-lru')

let cache = new WeakMap


class Text {
	constructor (o) {
		this.gl = createGl(o)

		let shader = cache.get(this.gl)

		if (!shader) {
			let regl = createRegl({
				gl: this.gl
			})

			// draw texture method
			let draw = regl({
				vert: `
				precision mediump float;
				attribute float width, offset, char;
				uniform float fontSize;
				uniform vec4 viewport;
				uniform vec2 position;
				varying vec2 charCoord;
				varying float charId;
				void main () {
					charId = char;
					charCoord = vec2(offset * fontSize * .05, position.y);

					vec2 position = charCoord / viewport.zw;
					gl_Position = vec4(position * 2. - 1., 0, 1);

					gl_PointSize = fontSize;
				}`,

				frag: `
				precision mediump float;
				uniform sampler2D atlas;
				uniform vec4 color, viewport;
				uniform float fontSize;
				uniform float atlasSize;
				varying float charId;
				varying vec2 charCoord;
				void main () {
					vec4 fontColor = color;
					vec2 uv = gl_FragCoord.xy - charCoord + fontSize * .5;
					uv.y = fontSize - uv.y;
					uv /= atlasSize;
					uv.x += charId * fontSize / atlasSize;
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
					position: regl.this('position'),
					atlasSize: Text.atlasSize,
					fontSize: regl.this('fontSize'),
					atlas: regl.this('atlasTexture'),
					viewport: regl.this('viewportArray'),
					color: regl.this('color'),
				},
				primitive: 'points',
				count: regl.this('count'),
				viewport: regl.this('viewport')
			})

			shader = {
				regl,
				draw,
				atlases: alru(Text.atlasCacheSize, {
					evict: (i, atlas) => {
						atlas.canvas = null
						atlas.context = null
						atlas.texture.destroy()
					}
				})
			}

			// TODO: it is possible to organize pool of font atlases cached by family/size and destroyed if number of instances is 0

			cache.set(this.gl, shader)
		}

		this.render = shader.draw.bind(this)
		this.regl = shader.regl
		this.atlases = shader.atlases

		this.charBuffer = this.regl.buffer({type: 'uint8', usage: 'stream'})
		this.sizeBuffer = this.regl.buffer({type: 'float', usage: 'stream'})

		this.update(isPlainObj(o) ? o : {})
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
			range: 'range dataBox',
			opacity: 'opacity alpha transparency visible visibility opaque'
		}, true)

		if (!this.text && !o.text) o.text = ''

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

		if (o.position) this.position = o.position

		// normalize font caching string
		let newFont = false
		if (typeof o.font === 'string') o.font = Font.parse(o.font)
		if (o.font) {
			if (!this.font || Font.stringify(o.font) !== Font.stringify(this.font)) {
				newFont = true
				this.font = o.font
				this.fontString = Font.stringify(this.font)

				// FIXME: detect units here
				this.fontSize = parseFloat(this.font.size || 24)

				// obtain atlas or create one
				this.atlas = this.atlases.get(this.fontString)
				if (!this.atlas) {
					let atlasCanvas = fontAtlas({
						font: this.fontString,
						chars: [],
						shape: [Text.atlasSize, Text.atlasSize]
					})
					this.atlas = {
						font: this.font,
						canvas: atlasCanvas,
						context: atlasCanvas.getContext('2d'),
						texture: this.regl.texture(),
						widths: {},
						ids: {},
						chars: []
					}

					this.atlases.set(this.fontString, this.atlas)
				}
				this.atlasTexture = this.atlas.texture
			}
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

				if (atlas.ids[char] == null) {
					atlas.ids[char] = atlas.chars.length
					atlas.chars.push(char)
					atlas.widths[char] = atlas.context.measureText(char).width

					newChars++
				}

				charIds[i] = atlas.ids[char]
				sizeData[i * 2] = atlas.widths[char]

				if (i) {
					let prevWidth = sizeData[i * 2 - 2]
					let currWidth = sizeData[i * 2]
					let prevOffset = sizeData[i * 2 - 1]
					let offset = prevOffset + prevWidth * .5 + currWidth * .5;
					sizeData[i * 2 + 1] = offset
				}
				else {
					sizeData[1] = sizeData[0] * .5
				}
			}

			this.charBuffer({data: charIds, type: 'uint8', usage: 'stream'})
			this.sizeBuffer({data: sizeData, type: 'float', usage: 'stream'})
			pool.freeUint8(charIds)
			pool.freeFloat(sizeData)

			// render new characters
			if (newChars || newFont) {
				fontAtlas({
					canvas: atlas.canvas,
					font: this.fontString,
					chars: atlas.chars,
					shape: [Text.atlasSize, Text.atlasSize],
					step: [this.fontSize, this.fontSize]
				})
				atlas.texture({
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


// size of an atlas
Text.atlasSize = 1024

// max number of different font atlases cached
Text.atlasCacheSize = 32


module.exports = Text
