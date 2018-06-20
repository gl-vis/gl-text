'use strict'

var Font = require('css-font')
var pick = require('pick-by-alias')
var createRegl = require('regl')
var createGl = require('gl-util/context')
var WeakMap = require('es6-weak-map')
var rgba = require('color-normalize')
var fontAtlas = require('font-atlas')
var pool = require('typedarray-pool')
var parseRect = require('parse-rect')
var isObj = require('is-plain-obj')
var parseUnit = require('parse-unit')
var px = require('to-px')
var kerning = require('detect-kerning')
var extend = require('object-assign')
var metrics = require('font-measure')


var shaderCache = new WeakMap


var GlText = function GlText (o) {
	if (isRegl(o)) {
		o = {regl: o}
		this.gl = o.regl._gl
	}
	else {
		this.gl = createGl(o)
	}

	var shader = shaderCache.get(this.gl)

	if (!shader) {
		var regl = o.regl || createRegl({ gl: this.gl })

		// draw texture method
		var draw = regl({
			vert: ("\n\t\t\t\tprecision highp float;\n\t\t\t\tattribute float width, charOffset, char;\n\t\t\t\tuniform float fontSize, charStep, em, align, baseline;\n\t\t\t\tuniform vec4 viewport;\n\t\t\t\tuniform vec2 position, atlasSize, atlasDim, scale, translate, offset;\n\t\t\t\tvarying vec2 charCoord, charId;\n\t\t\t\tvarying float charWidth;\n\t\t\t\tvoid main () {\n\t\t\t\t\tvec2 offset = floor(em * (vec2(align + charOffset, baseline) + offset)) / (viewport.zw * scale.xy);\n\t\t\t\t\tvec2 position = (position + translate) * scale;\n\t\t\t\t\tposition += offset * scale;\n\n\t\t\t\t\t" + (GlText.normalViewport ? 'position.y = 1. - position.y;' : '') + "\n\n\t\t\t\t\tcharCoord = position * viewport.zw + viewport.xy;\n\n\t\t\t\t\tgl_Position = vec4(position * 2. - 1., 0, 1);\n\n\t\t\t\t\tgl_PointSize = charStep;\n\n\t\t\t\t\tcharId.x = mod(char, atlasDim.x);\n\t\t\t\t\tcharId.y = floor(char / atlasDim.x);\n\n\t\t\t\t\tcharWidth = width * em;\n\t\t\t\t}"),

			frag: "\n\t\t\t\tprecision highp float;\n\t\t\t\tuniform sampler2D atlas;\n\t\t\t\tuniform vec4 color;\n\t\t\t\tuniform float fontSize, charStep;\n\t\t\t\tuniform vec2 atlasSize;\n\t\t\t\tvarying vec2 charCoord, charId;\n\t\t\t\tvarying float charWidth;\n\n\t\t\t\tfloat lightness(vec4 color) {\n\t\t\t\t\treturn color.r * 0.299 + color.g * 0.587 + color.b * 0.114;\n\t\t\t\t}\n\n\t\t\t\tvoid main () {\n\t\t\t\t\tfloat halfCharStep = floor(charStep * .5 + .5);\n\t\t\t\t\tvec2 uv = floor(gl_FragCoord.xy - charCoord + halfCharStep);\n\t\t\t\t\tuv.y = charStep - uv.y;\n\n\t\t\t\t\t// ignore points outside of character bounding box\n\t\t\t\t\tfloat halfCharWidth = ceil(charWidth * .5);\n\t\t\t\t\tif (floor(uv.x) > halfCharStep + halfCharWidth ||\n\t\t\t\t\t\tfloor(uv.x) < halfCharStep - halfCharWidth) return;\n\n\t\t\t\t\tuv += charId * charStep;\n\t\t\t\t\tuv = uv / atlasSize;\n\n\t\t\t\t\tvec4 fontColor = color;\n\t\t\t\t\tvec4 mask = texture2D(atlas, uv);\n\n\t\t\t\t\tfloat maskY = lightness(mask);\n\t\t\t\t\t// float colorY = lightness(fontColor);\n\t\t\t\t\tfontColor.a *= maskY;\n\n\t\t\t\t\t// fontColor.a += .1;\n\n\t\t\t\t\t// antialiasing, see yiq color space y-channel formula\n\t\t\t\t\t// fontColor.rgb += (1. - fontColor.rgb) * (1. - mask.rgb);\n\n\t\t\t\t\tgl_FragColor = fontColor;\n\t\t\t\t}",

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
				},
				offset: regl.this('offset')
			},
			primitive: 'points',
			count: regl.this('count'),
			viewport: regl.this('viewport')
		})

		// per font-size atlas
		var atlas = {}

		shader = { regl: regl, draw: draw, atlas: atlas }

		shaderCache.set(this.gl, shader)
	}

	this.render = shader.draw.bind(this)
	this.regl = shader.regl
	this.canvas = this.gl.canvas
	this.shader = shader

	this.charBuffer = this.regl.buffer({ type: 'uint8', usage: 'stream' })
	this.sizeBuffer = this.regl.buffer({ type: 'float', usage: 'stream' })

	this.update(isObj(o) ? o : {})
};

GlText.prototype.update = function update (o) {
		var this$1 = this;

	if (typeof o === 'string') { o = { text: o } }
	else if (!o) { return }

	// FIXME: make this a static transform or more general approact
	o = pick(o, {
		font: 'font fontFace fontface typeface cssFont css-font family fontFamily',
		fontSize: 'fontSize fontsize size font-size',
		text: 'text value symbols',
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


	if (o.opacity != null) { this.opacity = parseFloat(o.opacity) }

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

	if (o.kerning != null) { this.kerning = o.kerning }

	if (o.offset != null) {
		if (typeof o.offset === 'number') { this.offset = [o.offset, 0] }
		else { this.offset = o.offset }

		if (!GlText.normalViewport) {
			this.offset[1] *= -1
		}
	}

	if (o.direction) { this.direction = o.direction }

	if (o.position) { this.position = o.position }

	if (o.range) {
		this.range = o.range
		this.scale = [1 / (o.range[2] - o.range[0]), 1 / (o.range[3] - o.range[1])]
		this.translate = [-o.range[0], -o.range[1]]
	}
	if (o.scale) { this.scale = o.scale }
	if (o.translate) { this.translate = o.translate }

	// default scale corresponds to viewport
	if (!this.scale) { this.scale = [1 / this.viewport.width, 1 / this.viewport.height] }

	if (!this.translate) { this.translate = [0, 0] }

	if (!this.font && !o.font) { o.font = GlText.baseFontSize + 'px sans-serif' }

	// normalize font caching string
	var newFont = false, newFontSize = false

	// normalize font
	if (typeof o.font === 'string') {
		try {
			o.font = Font.parse(o.font)
		} catch (e) {
			o.font = Font.parse(GlText.baseFontSize + 'px ' + o.font)
		}
	}
	else if (o.font) { o.font = Font.parse(Font.stringify(o.font)) }

	// obtain new font data
	if (o.font) {
		var baseString = Font.stringify({
			size: GlText.baseFontSize,
			family: o.font.family,
			stretch: o.font.stretch,
			variant: o.font.variant,
			weight: o.font.weight,
			style: o.font.style
		})

		var unit = parseUnit(o.font.size)
		var fs = Math.round(unit[0] * px(unit[1]))
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
				var family = o.font.family.join(', ')
				this.font = {
					baseString: baseString,

					// typeface
					family: family,
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
						fontStyle: ((o.font.style) + " " + (o.font.variant) + " " + (o.font.weight) + " " + (o.font.stretch))
					})
				}

				GlText.fonts[baseString] = this.font
			}
		}
	}

	if (o.fontSize) {
		var unit$1 = parseUnit(o.fontSize)
		var fs$1 = Math.round(unit$1[0] * px(unit$1[1]))

		if (fs$1 != this.fontSize) {
			newFontSize = true
			this.fontSize = fs$1
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
			var metrics$1 = this.font.metrics

			this.shader.atlas[this.fontString] =
			this.fontAtlas = {
				// even step is better for rendered characters
				step: Math.ceil(this.fontSize * metrics$1.bottom * .5) * 2,
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
		if (o.text == null) { o.text = this.text }
	}

	// calculate offsets for the new font/text
	if (o.text != null || newFont) {
		// FIXME: ignore spaces
		this.text = o.text
		this.count = o.text.length

		var newAtlasChars = []

		// detect & measure new characters
		GlText.atlasContext.font = this.font.baseString

		for (var i = 0; i < this.text.length; i++) {
			var char = this$1.text.charAt(i)

			if (this$1.fontAtlas.ids[char] == null) {
				this$1.fontAtlas.ids[char] = this$1.fontAtlas.chars.length
				this$1.fontAtlas.chars.push(char)
				newAtlasChars.push(char)
			}

			if (this$1.font.width[char] == null) {
				this$1.font.width[char] = GlText.atlasContext.measureText(char).width / GlText.baseFontSize

				// measure kerning pairs for the new character
				if (this$1.kerning) {
					var pairs = []
					for (var baseChar in this$1.font.width) {
						pairs.push(baseChar + char, char + baseChar)
					}
					extend(this$1.font.kerning, kerning(this$1.font.family, {
						pairs: pairs
					}))
				}
			}
		}

		// populate text/offset buffers
		// as [charWidth, offset, charWidth, offset...]
		// that is in em units since font-size can change often
		var charIds = pool.mallocUint8(this.count)
		var sizeData = pool.mallocFloat(this.count * 2)
		for (var i$1 = 0; i$1 < this.count; i$1++) {
			var char$1 = this$1.text.charAt(i$1)
			var prevChar = this$1.text.charAt(i$1 - 1)

			charIds[i$1] = this$1.fontAtlas.ids[char$1]
			sizeData[i$1 * 2] = this$1.font.width[char$1]

			if (i$1) {
				var prevWidth = sizeData[i$1 * 2 - 2]
				var currWidth = sizeData[i$1 * 2]
				var prevOffset = sizeData[i$1 * 2 - 1]
				var offset = prevOffset + prevWidth * .5 + currWidth * .5;

				if (this$1.kerning) {
					var kerning$1 = this$1.font.kerning[prevChar + char$1]
					if (kerning$1) {
						offset += kerning$1 * 1e-3
					}
				}

				sizeData[i$1 * 2 + 1] = offset
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
			var step = this.fontAtlas.step

			var maxCols = Math.floor(GlText.maxAtlasSize / step)
			var cols = Math.min(maxCols, this.fontAtlas.chars.length)
			var rows = Math.ceil(this.fontAtlas.chars.length / cols)

			var atlasWidth = cols * step
			// let atlasHeight = Math.min(rows * step + step * .5, GlText.maxAtlasSize);
			var atlasHeight = rows * step;

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

	if (this.baseline == null && o.baseline == null) {
		o.baseline = 0
	}

	if (o.baseline != null) {
		this.baseline = o.baseline
		var m = this.font.metrics
		var base = 0
		base += m.bottom * .5
		if (typeof this.baseline === 'number') {
			base += (this.baseline - m.baseline)
		}
		else {
			base += -m[this.baseline]
		}
		if (!GlText.normalViewport) { base *= -1 }
		this.baselineOffset = base
	}
};

GlText.prototype.destroy = function destroy () {
	// TODO: count instances of atlases and destroy all on null
};


// defaults
GlText.prototype.kerning = true
GlText.prototype.color = [0, 0, 0, 1]
GlText.prototype.position = [0, 0]
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

function alignOffset (align, tw) {
	if (typeof align === 'number') { return align }
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

