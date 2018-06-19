'use strict'

let Font = require('css-font')
let createRegl = require('regl')
let pick = require('pick-by-alias')
let createGl = require('gl-util/context')
let WeakMap = require('es6-weak-map')
let rgba = require('color-normalize')
let fontAtlas = require('../font-atlas')
let pool = require('typedarray-pool')
let parseRect = require('parse-rect')
let isPlainObj = require('is-plain-obj')
let parseUnit = require('parse-unit')
let px = require('to-px')
let kerning = require('detect-kerning')
let extend = require('object-assign')
let metrics = require('font-measure')


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
			let regl = o.regl || createRegl({ gl: this.gl })

			// draw texture method
			let draw = regl({
				vert: `
				precision mediump float;
				attribute float width, charOffset, char;
				uniform float fontSize, charStep, em, align, baseline;
				uniform vec4 viewport;
				uniform vec2 position, atlasSize, atlasDim, scale, translate;
				varying vec2 charCoord, charId;
				varying float charWidth;
				void main () {
					vec2 offset = vec2(
						floor(align + em * charOffset + .5) / (viewport.z * scale.x),
						baseline / (viewport.w * scale.y)
					);
					vec2 position = (position + translate) * scale;
					position += offset * scale;

					${ GlText.normalViewport ? 'position.y = 1. - position.y;' : '' }

					charCoord = floor(position * viewport.zw + viewport.xy + .5);

					gl_Position = vec4(position * 2. - 1., 0, 1);

					gl_PointSize = charStep;

					charId.x = mod(char, atlasDim.x);
					charId.y = floor(char / atlasDim.x);

					charWidth = width * em;
				}`,

				frag: `
				precision mediump float;
				uniform sampler2D atlas;
				uniform vec4 color;
				uniform float fontSize, charStep;
				uniform vec2 atlasSize;
				varying vec2 charCoord, charId;
				varying float charWidth;

				float lightness(vec4 color) {
					return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
				}

				void main () {
					float halfCharStep = floor(charStep * .5);
					vec2 uv = gl_FragCoord.xy - charCoord + halfCharStep;
					uv.y = charStep - uv.y;

					// ignore points outside of character bounding box
					float halfCharWidth = ceil(charWidth * .5);
					if (floor(uv.x) > halfCharStep + halfCharWidth ||
						floor(uv.x) < halfCharStep - halfCharWidth) return;

					uv += charId * charStep;
					uv = uv / atlasSize;

					vec4 fontColor = color;
					vec4 mask = texture2D(atlas, uv);

					float maskY = lightness(mask);
					// float colorY = lightness(fontColor);
					fontColor.a *= maskY;

					// fontColor.a += .1;

					// antialiasing, see yiq color space y-channel formula
					// fontColor.rgb += (1. - fontColor.rgb) * (1. - mask.rgb);

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
					charOffset: {
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
					atlasSize: function () {
						return [this.fontAtlas.width, this.fontAtlas.height]
					},
					atlasDim: function () {
						return [this.fontAtlas.cols, this.fontAtlas.rows]
					},
					fontSize: regl.this('fontSize'),
					em: function () { return this.fontSize },
					atlas: function () { return this.fontAtlas.texture },
					viewport: regl.this('viewportArray'),
					color: regl.this('color'),
					scale: regl.this('scale'),
					align: regl.this('alignOffset'),
					baseline: regl.this('baselineOffset'),
					translate: regl.this('translate'),
					charStep: function () {
						return this.fontAtlas.step
					}
				},
				primitive: 'points',
				count: regl.this('count'),
				viewport: regl.this('viewport')
			})

			// per font-size atlas
			let atlas = {}

			shader = { regl, draw, atlas }

			GlText.shaderCache.set(this.gl, shader)
		}

		this.render = shader.draw.bind(this)
		this.regl = shader.regl
		this.canvas = this.gl.canvas
		this.shader = shader

		this.charBuffer = this.regl.buffer({ type: 'uint8', usage: 'stream' })
		this.sizeBuffer = this.regl.buffer({ type: 'float', usage: 'stream' })

		this.update(isPlainObj(o) ? o : {})
	}

	update (o) {
		if (typeof o === 'string') o = { text: o }
		else if (!o) return

		// FIXME: make this a static transform or more general approact
		o = pick(o, {
			font: 'font fontFace fontface typeface cssFont css-font',
			fontSize: 'fontSize fontsize size font-size',
			text: 'text value symbols',
			align: 'align alignment textAlign textbaseline',
			baseline: 'baseline textBaseline textbaseline',
			direction: 'dir direction textDirection',
			color: 'color colour fill fill-color fillColor textColor textcolor',
			kerning: 'kerning kern',
			viewport: 'vp viewport viewBox viewbox viewPort',
			range: 'range dataBox',
			opacity: 'opacity alpha transparency visible visibility opaque',
			offset: 'offset padding shift indent indentation'
		}, true)


		if (o.opacity != null) this.opacity = parseFloat(o.opacity)

		// FIXME: mb add multiple colors?
		if (o.color) {
			this.color = rgba(o.color)
		}

		if (o.viewport != null) {
			this.viewport = parseRect(o.viewport)

			if (GlText.normalViewport) {
				this.viewport.y = this.canvas.height - this.viewport.y - this.viewport.height
			}

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

		if (o.direction) this.direction = o.direction

		if (o.position) this.position = o.position

		if (o.range) {
			this.range = o.range
			this.scale = [1 / (o.range[2] - o.range[0]), 1 / (o.range[3] - o.range[1])]
			this.translate = [-o.range[0], -o.range[1]]
		}
		if (o.scale) this.scale = o.scale
		if (o.translate) this.translate = o.translate

		// default scale corresponds to viewport
		if (!this.scale) this.scale = [1 / this.viewport.width, 1 / this.viewport.height]

		if (!this.translate) this.translate = [0, 0]

		if (!this.font && !o.font) o.font = '16px sans-serif'

		// normalize font caching string
		let newFont = false, newFontSize = false

		// normalize font
		if (typeof o.font === 'string') o.font = Font.parse(o.font)
		else if (o.font) o.font = Font.parse(Font.stringify(o.font))

		// obtain new font data
		if (o.font) {
			let baseString = Font.stringify({
				size: GlText.baseFontSize,
				family: o.font.family,
				stretch: o.font.stretch,
				variant: o.font.variant,
				weight: o.font.weight,
				style: o.font.style
			})

			let unit = parseUnit(o.font.size)
			let fs = Math.round(unit[0] * px(unit[1]))
			if (fs !== this.fontSize) {
				newFontSize = true
				this.fontSize = fs
			}

			// calc new font metrics/atlas
			if (!this.font || baseString != this.font.baseString) {
				newFont = true

				// obtain font cache or create one
				this.font = GlText.fonts[baseString]
				if (!this.font) {
					let family = o.font.family.join(', ')
					this.font = {
						baseString,

						// typeface
						family,
						weight: o.font.weight,
						stretch: o.font.stretch,
						style: o.font.style,
						variant: o.font.variant,

						// widths of characters
						width: {},

						// kernin pairs offsets
						kerning: {},

						metrics: metrics(family, {
							origin: 'top',
							fontSize: GlText.baseFontSize,
							fontStyle: `${o.font.style} ${o.font.variant} ${o.font.weight} ${o.font.stretch}`
						})
					}

					GlText.fonts[baseString] = this.font
				}
			}
		}

		if (o.fontSize) {
			let unit = parseUnit(o.fontSize)
			let fs = Math.round(unit[0] * px(unit[1]))

			if (fs != this.fontSize) {
				newFontSize = true
				this.fontSize = fs
			}
		}

		if (newFont || newFontSize) {
			this.fontString = Font.stringify({
				size: this.fontSize,
				family: this.font.family,
				stretch: this.font.stretch,
				variant: this.font.variant,
				weight: this.font.weight,
				style: this.font.style
			})

			// calc new font size atlas
			this.fontAtlas = this.shader.atlas[this.fontString]

			if (!this.fontAtlas) {
				let metrics = this.font.metrics

				this.shader.atlas[this.fontString] =
				this.fontAtlas = {
					step: this.fontSize * metrics.bottom,
					em: this.fontSize,
					cols: 0,
					rows: 0,
					height: 0,
					width: 0,
					chars: [],
					ids: {},
					texture: this.regl.texture()
				}
			}

			// bump atlas characters
			if (o.text == null) o.text = this.text
		}

		// calculate offsets for the new font/text
		if (o.text != null || newFont) {
			// FIXME: ignore spaces
			this.text = o.text
			this.count = o.text.length

			let newAtlasChars = []

			// detect & measure new characters
			GlText.atlasContext.font = this.font.baseString

			for (let i = 0; i < this.text.length; i++) {
				let char = this.text.charAt(i)

				if (this.fontAtlas.ids[char] == null) {
					this.fontAtlas.ids[char] = this.fontAtlas.chars.length
					this.fontAtlas.chars.push(char)
					newAtlasChars.push(char)
				}

				if (this.font.width[char] == null) {
					this.font.width[char] = GlText.atlasContext.measureText(char).width / GlText.baseFontSize

					// measure kerning pairs for the new character
					if (this.kerning) {
						let pairs = []
						for (let baseChar in this.font.width) {
							pairs.push(baseChar + char, char + baseChar)
						}
						extend(this.font.kerning, kerning(this.font.family, pairs))
					}
				}
			}

			// populate text/offset buffers
			// as [charWidth, offset, charWidth, offset...]
			// that is in em units since font-size can change often
			let charIds = pool.mallocUint8(this.count)
			let sizeData = pool.mallocFloat(this.count * 2)
			for (let i = 0; i < this.count; i++) {
				let char = this.text.charAt(i)
				let prevChar = this.text.charAt(i - 1)

				charIds[i] = this.fontAtlas.ids[char]
				sizeData[i * 2] = this.font.width[char]

				if (i) {
					let prevWidth = sizeData[i * 2 - 2]
					let currWidth = sizeData[i * 2]
					let prevOffset = sizeData[i * 2 - 1]
					let offset = prevOffset + prevWidth * .5 + currWidth * .5;

					if (this.kerning) {
						let kerning = this.font.kerning[prevChar + char]
						if (kerning) {
							offset += kerning * 1e-3
						}
					}

					sizeData[i * 2 + 1] = offset
				}
				else {
					sizeData[1] = sizeData[0] * .5
				}
			}

			if (this.count) {
				this.textWidth = (sizeData[sizeData.length - 2] * .5 + sizeData[sizeData.length - 1])
			} else {
				this.textWidth = 0
			}
			this.alignOffset = alignOffset(this.align, this.textWidth)

			this.charBuffer({data: charIds, type: 'uint8', usage: 'stream'})
			this.sizeBuffer({data: sizeData, type: 'float', usage: 'stream'})
			pool.freeUint8(charIds)
			pool.freeFloat(sizeData)

			// udpate font atlas and texture
			if (newAtlasChars.length) {
				// FIXME: insert metrics-based ratio here
				let step = this.fontAtlas.step

				let maxCols = Math.floor(GlText.maxAtlasSize / step)
				let cols = Math.min(maxCols, this.fontAtlas.chars.length)
				let rows = Math.ceil(this.fontAtlas.chars.length / cols)

				let atlasWidth = cols * step
				// let atlasHeight = Math.min(rows * step + step * .5, GlText.maxAtlasSize);
				let atlasHeight = rows * step;

				this.fontAtlas.width = atlasWidth
				this.fontAtlas.height = atlasHeight;
				this.fontAtlas.rows = rows
				this.fontAtlas.cols = cols

				this.fontAtlas.texture({
					data: fontAtlas({
						canvas: GlText.atlasCanvas,
						font: this.fontString,
						chars: this.fontAtlas.chars,
						shape: [atlasWidth, atlasHeight],
						step: [step, step]
					})
				})
			}
		}

		if (o.align) {
			this.align = o.align
			this.alignOffset = alignOffset(this.align, this.textWidth)
		}

		if (o.baseline != null) {
			this.baseline = o.baseline
			let m = this.font.metrics
			let base = 0
			base += m.bottom * this.fontSize * .5
			if (typeof this.baseline === 'number') {
				base += (this.baseline - m.baseline) * this.fontSize
			}
			else {
				base += -m[this.baseline] * this.fontSize
			}
			if (!GlText.normalViewport) base *= -1
			this.baselineOffset = base
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
GlText.prototype.translate = null
GlText.prototype.scale = null
GlText.prototype.font = null
GlText.prototype.baselineOffset = 0
GlText.prototype.text = ''


// whether viewport should be top↓bottom 2d one (true) or webgl one (false)
GlText.normalViewport = false

// size of an atlas
GlText.maxAtlasSize = 1024

// per gl-context storage
GlText.shaderCache = new WeakMap

// font atlas canvas is singleton
GlText.atlasCanvas = document.createElement('canvas')
GlText.atlasContext = GlText.atlasCanvas.getContext('2d', {alpha: false})

// font-size used for metrics, atlas step calculation
GlText.baseFontSize = 128

// fontSize / atlasStep multiplier
// FIXME: figure that out from line-height
GlText.atlasStep = 1

// fonts storage
GlText.fonts = {}

// max number of different font atlases/textures cached
// FIXME: enable atlas size limitation via LRU
// GlText.atlasCacheSize = 64

function alignOffset (align, tw) {
	switch (align) {
		case 'right':
		case 'end':
			return -tw
		case 'center':
		case 'centre':
		case 'middle':
			return -tw * .5
	}
	return 0
}

function isRegl (o) {
	return typeof o === 'function' &&
	o._gl &&
	o.prop &&
	o.texture &&
	o.buffer
}


module.exports = GlText
