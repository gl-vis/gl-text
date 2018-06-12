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
let parseUnit = require('parse-unit')
let px = require('to-px')
let kerning = require('detect-kerning')
let extend = require('object-assign')



class GlText {
	constructor (o) {
		if (isRegl(o)) {
			o = {regl: o}
			this.gl = o.regl._gl
		}
		else {
			this.gl = createGl(o)
		}

		let shader = GlText.shaderCache.get(this.gl)

		if (!shader) {
			let regl = o.regl || createRegl({
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
				uniform vec2 atlasSize;
				varying vec2 charCoord, charId;
				varying float charStep;
				void main () {
					charCoord = vec2(offset + position.x, position.y);

					vec2 position = charCoord / viewport.zw;
					gl_Position = vec4(position * 2. - 1., 0, 1);

					charStep = fontSize * ${GlText.atlasStep.toPrecision(3)};
					gl_PointSize = charStep;

					float charsPerRow = floor(atlasSize.x / charStep);
					charId.x = mod(char, charsPerRow);
					charId.y = floor(char / charsPerRow);
				}`,

				frag: `
				precision mediump float;
				uniform sampler2D atlas;
				uniform vec4 color, viewport;
				uniform float fontSize;
				uniform vec2 atlasSize;
				varying float charStep;
				varying vec2 charCoord, charId;
				void main () {
					vec4 fontColor = color;
					vec2 uv = gl_FragCoord.xy - charCoord + charStep * .5;
					uv.y = charStep - uv.y;
					uv += charId * charStep;
					uv = floor(uv) / atlasSize;
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
					atlasSize: regl.this('atlasSize'),
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
				atlasCache: alru(GlText.atlasCacheSize, {
					evict: (i, atlas) => {
						atlas.texture.destroy()
					}
				})
			}

			GlText.shaderCache.set(this.gl, shader)
		}

		this.render = shader.draw.bind(this)
		this.regl = shader.regl
		this.atlasCache = shader.atlasCache

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
			kerning: 'kerning kern',
			viewport: 'vp viewport viewBox viewbox viewPort',
			range: 'range dataBox',
			opacity: 'opacity alpha transparency visible visibility opaque'
		}, true)

		if (this.text != null && o.text != null) o.text = ''

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

		if (o.kerning != null) this.kerning = o.kerning

		if (o.baseline) this.baseline = o.baseline
		if (o.direction) this.direction = o.direction
		if (o.align) this.align = o.align

		if (o.position) this.position = o.position

		// normalize font caching string
		let newFont = false

		if (typeof o.font === 'string') o.font = Font.parse(o.font)
		else if (o.font) o.font = Font.parse(Font.stringify(o.font))

		if (o.font) {
			if (!this.font || Font.stringify(o.font) !== Font.stringify(this.font)) {
				newFont = true
				this.font = o.font
				this.fontString = Font.stringify(this.font)

				// convert any unit to px
				let unit = parseUnit(this.font.size)
				this.fontSize = unit[0] * px(unit[1])

				this.fontFamily = (this.font.family || ['sans-serif']).join(', ')

				// obtain atlas or create one
				this.atlas = this.atlasCache.get(this.fontString)
				if (!this.atlas) {
					this.atlas = {
						font: this.font,
						texture: this.regl.texture(),
						widths: {},
						ids: {},
						chars: [],
						kerning: GlText.kerningCache[this.fontFamily] || (GlText.kerningCache[this.fontFamily] = {})
					}

					this.atlasCache.set(this.fontString, this.atlas)
				}
				this.atlasTexture = this.atlas.texture
			}
		}

		if (o.text) {
			this.text = o.text
			this.count = o.text.length

			let atlas = this.atlas
			let newChars = []
			let kerningTable = GlText.kerningCache[this.fontFamily]

			GlText.atlasContext.font = this.fontString

			// detect new characters & measure their width
			for (let i = 0; i < this.count; i++) {
				let char = this.text.charAt(i)

				if (atlas.ids[char] == null) {
					atlas.ids[char] = atlas.chars.length
					atlas.chars.push(char)
					atlas.widths[char] = GlText.atlasContext.measureText(char).width

					newChars.push(char)
				}
			}

			// calculate kerning if enabled
			if (this.kerning && newChars.length) {
				let pairs = []
				for (let i = 0; i < newChars.length; i++) {
					for (let char in atlas.ids) {
						pairs.push(newChars[i] + char)
						if (char != newChars[i]) pairs.push(char + newChars[i])
					}
				}
				extend(kerningTable, kerning(this.fontFamily, pairs))
			}

			// populate text/offset buffers
			let charIds = pool.mallocUint8(this.count)
			let sizeData = pool.mallocFloat(this.count * 2)
			for (let i = 0; i < this.count; i++) {
				let char = this.text.charAt(i)
				let prevChar = this.text.charAt(i - 1)

				charIds[i] = atlas.ids[char]
				sizeData[i * 2] = atlas.widths[char]

				if (i) {
					let prevWidth = sizeData[i * 2 - 2]
					let currWidth = sizeData[i * 2]
					let prevOffset = sizeData[i * 2 - 1]
					let offset = prevOffset + prevWidth * .5 + currWidth * .5;

					if (this.kerning) {
						let kern = kerningTable[prevChar + char]
						if (kern) {
							offset += this.fontSize * kern * 1e-3
						}
					}

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

			// rerender characters texture
			if (newChars.length || newFont) {
				let step = this.fontSize * GlText.atlasStep
				this.atlasSize = [
					Math.min(step * atlas.chars.length, GlText.maxAtlasSize),
					step * Math.ceil((step * atlas.chars.length) / GlText.maxAtlasSize)
				]
				fontAtlas({
					canvas: GlText.atlasCanvas,
					font: this.fontString,
					chars: atlas.chars,
					shape: this.atlasSize,
					step: [step, step]
				})
				// document.body.appendChild(GlText.atlasCanvas)
				atlas.texture(GlText.atlasCanvas)
			}
		}

		if (o.color) {
			this.color = rgba(o.color)
		}
	}

	destroy () {
		// TODO: count instances of atlases and destroy all on null
	}
}


// defaults
GlText.prototype.kerning = true
GlText.prototype.color = [0, 0, 0, 1]
GlText.prototype.position = [0, 0]


// size of an atlas
GlText.maxAtlasSize = 1024

// fontSize / atlasStep multiplier
GlText.atlasStep = 1.2

// max number of different font atlases/textures cached
GlText.atlasCacheSize = 64


// per gl context storage
GlText.shaderCache = new WeakMap

// font atlas canvas is singleton
GlText.atlasCanvas = document.createElement('canvas')
GlText.atlasContext = GlText.atlasCanvas.getContext('2d')

// per font kerning storage
GlText.kerningCache = {}



function isRegl (o) {
	return typeof o === 'function' &&
	o._gl &&
	o.prop &&
	o.texture &&
	o.buffer
}


module.exports = GlText
