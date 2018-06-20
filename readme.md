# gl-text [![unstable](https://img.shields.io/badge/stability-unstable-green.svg)](http://github.com/badges/stability-badges)

Render text in WebGL via [font-atlas](https://ghub.io/font-atlas).

* Performance
* Atlas caching
* Antialiasing

![gl-text](https://github.com/dy/gl-text/blob/master/preview.png?raw=true)

[Demo](https://dy.github.io/gl-text).


## Usage

[![npm install gl-text](https://nodei.co/npm/gl-text.png?mini=true)](https://npmjs.org/package/gl-text/)

```js
let Text = require('gl-text')

let text1 = new Text()

// set state
text1.update({
	position: [x, y],
	viewport: [],
	text: 'ABC',
	align: '',
	baseline: '',
	direction: '',

	font: 'Helvetica 16px/1.2'
})

// render frame
text1.render()


let text2 = new Text(text1.gl)

text2.update({
	font: { family: ['Helvetica', 'Arial', 'sans-serif'], size: '1rem' },

})
```

## API

### `text = Text(gl|regl|opts?)`

Option | Meaning
---|---
`regl` | Existing `regl` instance. By default new one is created.
`gl`, `context` | Existing WebGL context. By default new one is created.
`canvas` | Existing `canvas` element.
`container` | Existing `container` element. By default new canvas is created within the container.

### `text.update(options)`

Set state of the `Text` instance.

Option | Description
---|---
`text` | Text string to output.
`position` | Position of the text within the `range`, a couple `[x, y]`.
`align` | Alignment of a text relative to `position`. Can be a string one of `left`, `right`, `center`/`middle`, `start`, `end`, or a number of em units.
`baseline` | Vertical alignment value, by default `middle`. Can be a string one of `top`, `hanging`, `middle`, `alphabetic`, `ideographic`, `bottom` etc. (see [font-measure](https://ghub.io/font-measure)) or a number of em units, denoting `0` as alphabetic baseline.
`font` | Font family, CSS font string or object with font settings, see [css-font](https://ghub.io/css-font).
`em` | Font-size, can be changed independently of `font` property.
`range` | Data area corresponding to position in viewport. Useful for organizing fast zoom/pan. By default is the same as the viewport `[0, 0, canvas.width, canvas.height]`.
`viewport` | Visible area within the canvas, an array `[left, top, width, height]` or rectangle, see [parse-rect](https://ghub.io/parse-rect).
`direction` |
`kerning` | Enable font kerning, by default `true`. Disable for the case of monospace fonts. See [detect-kerning](https://ghub.io/detect-kerning) package.
`letterSpacing`, `tracking` | Distance between letters, fractions of `em`. By default `0`.
`lineHeight`, `leading` | Distance between text lines.
`offset` | Shift `position` by the number of ems. Useful for organizing multiple lines, indentation, sub/sup script etc. Does not get affected by `position` change. Can be a number for x-offset only or an array for x, y offsets.

### `text.render()`

Render frame with the text.

### `text.destroy()`

Dispose text renderer and all the associated resources.


## License

© 2018 Dmitry Yv. MIT License

Development supported by [plot.ly](https://github.com/plotly/).
