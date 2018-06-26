'use strict'

let Font = require('css-font')
let pick = require('pick-by-alias')
let createRegl = require('regl')
let createGl = require('gl-util/context')
let WeakMap = require('es6-weak-map')
let rgba = require('color-normalize')
let fontAtlas = require('font-atlas')
let pool = require('typedarray-pool')
let parseRect = require('parse-rect')
let isObj = require('is-plain-obj')
let parseUnit = require('parse-unit')
let px = require('to-px')
let kerning = require('detect-kerning')
let extend = require('object-assign')
let metrics = require('font-measure')


let shaderCache = new WeakMap


class GlText {
	constructor (o) {
		if (isRegl(o)) {
			o = {regl: o}
			this.gl = o.regl._gl
		}
		else {
			this.gl = createGl(o)
		}

		this.shader = shaderCache.get(this.gl)

		if (!this.shader) {
			this.regl = o.regl || createRegl({ gl: this.gl, extensions: 'ANGLE_instanced_arrays' })
		}
		else {
			this.regl = this.shader.regl
		}

		this.charBuffer = this.regl.buffer({ type: 'uint8', usage: 'stream' })
		this.sizeBuffer = this.regl.buffer({ type: 'float', usage: 'stream' })

		if (!this.shader) {
			this.shader = this.createShader()
			shaderCache.set(this.gl, this.shader)
		}

		this.batch = []

		// this.render = this.shader.draw.bind(this)
		this.render = function () {
			this.shader.draw.call(this, this.batch)
		}
		this.canvas = this.gl.canvas

		this.update(isObj(o) ? o : {})
	}

	createShader () {
		let regl = this.regl

		// draw texture method
		let draw = regl({
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

			count: regl.prop('count'),
			offset: regl.prop('offset'),
			attributes: {
				char: this.charBuffer,
				charOffset: {
					offset: 4,
					stride: 8,
					buffer: this.sizeBuffer
				},
				width: {
					offset: 0,
					stride: 8,
					buffer: this.sizeBuffer
				},
				position: regl.this('position')
			},
			uniforms: {
				color: regl.prop('color'),
				atlasSize: () => [this.fontAtlas.width, this.fontAtlas.height],
				atlasDim: () =>	[this.fontAtlas.cols, this.fontAtlas.rows],
				fontSize: regl.this('fontSize'),
				em: () => this.fontSize,
				atlas: () => this.fontAtlas.texture,
				viewport: regl.this('viewportArray'),
				scale: regl.this('scale'),
				align: regl.prop('align'),
				baseline: regl.prop('baseline'),
				translate: regl.this('translate'),
				charStep: () => this.fontAtlas.step,
				offset: regl.this('offset')
			},
			primitive: 'points',
			viewport: regl.this('viewport'),

			vert: `
			precision highp float;
			attribute float width, charOffset, char;
			attribute vec2 position;
			uniform float fontSize, charStep, em, align, baseline;
			uniform vec4 viewport;
			uniform vec4 color;
			uniform vec2 atlasSize, atlasDim, scale, translate, offset;
			varying vec2 charCoord, charId;
			varying float charWidth;
			varying vec4 fontColor;
			void main () {
				vec2 offset = floor(em * (vec2(align + charOffset, baseline) + offset)) / (viewport.zw * scale.xy);
				vec2 position = (position + translate) * scale;
				position += offset * scale;

				${ GlText.normalViewport ? 'position.y = 1. - position.y;' : '' }

				charCoord = position * viewport.zw + viewport.xy;

				gl_Position = vec4(position * 2. - 1., 0, 1);

				gl_PointSize = charStep;

				charId.x = mod(char, atlasDim.x);
				charId.y = floor(char / atlasDim.x);

				charWidth = width * em;

				fontColor = color / 255.;
			}`,

			frag: `
			precision highp float;
			uniform sampler2D atlas;
			uniform float fontSize, charStep;
			uniform vec2 atlasSize;
			varying vec4 fontColor;
			varying vec2 charCoord, charId;
			varying float charWidth;

			float lightness(vec4 color) {
				return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
			}

			void main () {
				vec2 uv = floor(gl_FragCoord.xy - charCoord + charStep * .5);
				float halfCharStep = floor(charStep * .5 + .5);

				// invert y and shift by 1px (FF expecially needs that)
				uv.y = charStep - uv.y - .5;

				// ignore points outside of character bounding box
				float halfCharWidth = ceil(charWidth * .5);
				if (floor(uv.x) > halfCharStep + halfCharWidth ||
					floor(uv.x) < halfCharStep - halfCharWidth) return;

				uv += charId * charStep;
				uv = uv / atlasSize;

				vec4 color = fontColor;
				vec4 mask = texture2D(atlas, uv);

				float maskY = lightness(mask);
				// float colorY = lightness(color);
				color.a *= maskY;

				// color.a += .1;

				// antialiasing, see yiq color space y-channel formula
				// color.rgb += (1. - color.rgb) * (1. - mask.rgb);

				gl_FragColor = color;
			}`
		})

		// per font-size atlas
		let atlas = {}

		return { regl, draw, atlas }
	}

	update (o) {
		if (typeof o === 'string') o = { text: o }
		else if (!o) return

		// FIXME: make this a static transform or more general approact
		o = pick(o, {
			position: 'position positions coord coords coordinates',
			font: 'font fontFace fontface typeface cssFont css-font family fontFamily',
			fontSize: 'fontSize fontsize size font-size',
			text: 'text texts chars characters value values symbols',
			align: 'align alignment textAlign textbaseline',
			baseline: 'baseline textBaseline textbaseline',
			direction: 'dir direction textDirection',
			color: 'color colour fill fill-color fillColor textColor textcolor',
			kerning: 'kerning kern',
			range: 'range dataBox',
			viewport: 'vp viewport viewBox viewbox viewPort',
			opacity: 'opacity alpha transparency visible visibility opaque',
			offset: 'offset padding shift indent indentation'
		}, true)


		if (o.opacity != null) this.opacity = parseFloat(o.opacity)

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

		if (o.offset != null) {
			if (typeof o.offset === 'number') this.offset = [o.offset, 0]
			else this.offset = o.offset.slice()

			if (!GlText.normalViewport) {
				this.offset[1] *= -1
			}
		}

		if (o.direction) this.direction = o.direction

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

		if (!this.font && !o.font) o.font = GlText.baseFontSize + 'px sans-serif'

		// normalize font caching string
		let newFont = false, newFontSize = false

		// normalize font
		if (typeof o.font === 'string') {
			try {
				o.font = Font.parse(o.font)
			} catch (e) {
				o.font = Font.parse(GlText.baseFontSize + 'px ' + o.font)
			}
		}
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
					// even step is better for rendered characters
					step: Math.ceil(this.fontSize * metrics.bottom * .5) * 2,
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
		let newAtlasChars
		if (o.text != null || newFont) {
			// FIXME: ignore spaces
			// text offsets within the text buffer
			this.textOffsets = [0]
			if (Array.isArray(o.text)) {
				this.count = o.text[0].length
				this.counts = [this.count]
				for (let i = 1; i < o.text.length; i++) {
					this.textOffsets[i] = this.textOffsets[i - 1] + o.text[i - 1].length
					this.count += o.text[i].length
					this.counts.push(o.text[i].length)
				}
				this.text = o.text.join('')
			}
			else {
				this.text = o.text
				this.count = this.text.length
				this.counts = [this.count]
			}

			newAtlasChars = []

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
						extend(this.font.kerning, kerning(this.font.family, {
							pairs
						}))
					}
				}
			}
		}

		// create single position buffer (faster than batch or multiple separate instances)
		if (o.position) {
			if (o.position.length > 2) {
				let flat = !o.position[0].length
				let positionData = pool.mallocFloat(this.count * 2)
				for (let i = 0, ptr = 0; i < this.counts.length; i++) {
					let count = this.counts[i]
					if (flat) {
						for (let j = 0; j < count; j++) {
							positionData[ptr++] = o.position[i * 2]
							positionData[ptr++] = o.position[i * 2 + 1]
						}
					}
					else {
						for (let j = 0; j < count; j++) {
							positionData[ptr++] = o.position[i][0]
							positionData[ptr++] = o.position[i][1]
						}
					}
				}
				if (this.position.call) {
					this.position({
						type: 'float',
						data: positionData
					})
				} else {
					this.position = this.regl.buffer({
						type: 'float',
						data: positionData
					})
				}
				pool.freeFloat(positionData)
			}
			else {
				if (this.position.destroy) this.position.destroy()
				this.position = {
					constant: o.position
				}
			}
		}

		// populate text/offset buffers if font/text has changed
		// as [charWidth, offset, charWidth, offset...]
		// that is in em units since font-size can change often
		if (o.text || newFont) {
			let charIds = pool.mallocUint8(this.count)
			let sizeData = pool.mallocFloat(this.count * 2)
			this.textWidth = []

			for (let i = 0, ptr = 0; i < this.counts.length; i++) {
				let count = this.counts[i]

				for (let j = 0; j < count; j++) {
					let char = this.text.charAt(ptr)
					let prevChar = this.text.charAt(ptr - 1)

					charIds[ptr] = this.fontAtlas.ids[char]
					sizeData[ptr * 2] = this.font.width[char]

					if (j) {
						let prevWidth = sizeData[ptr * 2 - 2]
						let currWidth = sizeData[ptr * 2]
						let prevOffset = sizeData[ptr * 2 - 1]
						let offset = prevOffset + prevWidth * .5 + currWidth * .5;

						if (this.kerning) {
							let kerning = this.font.kerning[prevChar + char]
							if (kerning) {
								offset += kerning * 1e-3
							}
						}

						sizeData[ptr * 2 + 1] = offset
					}
					else {
						sizeData[ptr * 2 + 1] = sizeData[ptr * 2] * .5
					}

					ptr++
				}
				this.textWidth.push(
					!sizeData.length ? 0 :
					// last offset + half last width
					sizeData[ptr * 2 - 2] * .5 + sizeData[ptr * 2 - 1]
				)
			}


			// bump recalc align offset
			if (!o.align) o.align = this.align

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

			this.alignOffset = this.textWidth.map((textWidth, i) => {
				let align = Array.isArray(this.align) ? this.align[i] : this.align

				if (typeof align === 'number') return align
				switch (align) {
					case 'right':
					case 'end':
						return -textWidth
					case 'center':
					case 'centre':
					case 'middle':
						return -textWidth * .5
				}

				return 0
			})
		}

		if (this.baseline == null && o.baseline == null) {
			o.baseline = 0
		}
		if (o.baseline != null) {
			this.baseline = o.baseline
			if (!Array.isArray(this.baseline)) this.baseline = [this.baseline]
			this.baselineOffset = this.baseline.map(baseline => {
				let m = this.font.metrics
				let base = 0

				base += m.bottom * .5

				if (typeof baseline === 'number') {
					base += (baseline - m.baseline)
				}
				else {
					base += -m[baseline]
				}

				if (!GlText.normalViewport) base *= -1
				return base
			})
		}

		// flatten colors to a single uint8 array
		if (o.color != null) {
			if (!o.color) o.color = 'transparent'

			// single color
			if (typeof o.color === 'string' || !isNaN(o.color)) {
				this.color = rgba(o.color, 'uint8')
			}
			// array
			else {
				let colorData

				// flat array
				if (typeof o.color[0] === 'number' && o.color.length > this.counts.length) {
					let l = o.color.length
					colorData = pool.mallocUint8(l)
					let sub = (o.color.subarray || o.color.slice).bind(o.color)
					for (let i = 0; i < l; i += 4) {
						colorData.set(rgba(sub(i, i + 4), 'uint8'), i)
					}
				}
				// nested array
				else {
					let l = o.color.length
					colorData = pool.mallocUint8(l * 4)
					for (let i = 0; i < l; i++) {
						colorData.set(rgba(o.color[i], 'uint8'), i * 4)
					}
				}

				this.color = colorData
			}
		}

		// update render batch
		if (o.position || o.text || o.color || o.baseline || o.align) {
			if (Array.isArray(o.color) || Array.isArray(o.baseline) || Array.isArray(o.align)) {
				this.batch = Array(o.text.length)
				for (let i = 0; i < this.batch.length; i++) {
					this.batch[i] = {
						count: this.counts[i],
						offset: this.textOffsets[i],
						color: !this.color ? [0,0,0,255] : this.color.length <= 4 ? this.color : this.color.subarray(i * 4, i * 4 + 4),
						baseline: this.baselineOffset[i] != null ? this.baselineOffset[i] : this.baselineOffset[0],
						align: !this.align ? 0 : this.alignOffset[i] != null ? this.alignOffset[i] : this.alignOffset[0]
						// font:
					}
				}
			}
			// single-color, single-baseline, single-align batch is faster to render
			else {
				this.batch = [{
					count: this.count,
					offset: 0,
					color: this.color || [0,0,0,255],
					baseline: this.baselineOffset[0],
					align: this.alignOffset ? this.alignOffset[0] : 0
				}]
			}
		}
	}

	destroy () {
		// TODO: count instances of atlases and destroy all on null
	}
}


// defaults
GlText.prototype.kerning = true
GlText.prototype.position = { constant: new Float32Array(2) }
GlText.prototype.translate = null
GlText.prototype.scale = null
GlText.prototype.font = null
GlText.prototype.text = ''
GlText.prototype.offset = [0, 0]


// whether viewport should be top↓bottom 2d one (true) or webgl one (false)
GlText.normalViewport = false

// size of an atlas
GlText.maxAtlasSize = 1024

// font atlas canvas is singleton
GlText.atlasCanvas = document.createElement('canvas')
GlText.atlasContext = GlText.atlasCanvas.getContext('2d', {alpha: false})

// font-size used for metrics, atlas step calculation
GlText.baseFontSize = 64

// fonts storage
GlText.fonts = {}

// max number of different font atlases/textures cached
// FIXME: enable atlas size limitation via LRU
// GlText.atlasCacheSize = 64

function isRegl (o) {
	return typeof o === 'function' &&
	o._gl &&
	o.prop &&
	o.texture &&
	o.buffer
}


module.exports = GlText
