# gl-text [![unstable](https://img.shields.io/badge/stability-unstable-green.svg)](http://github.com/badges/stability-badges)

Render bitmap text in WebGL via [font-atlas](https://ghub.io/font-atlas).

## Usage

[![npm install gl-text](https://nodei.co/npm/gl-text.png?mini=true)](https://npmjs.org/package/gl-text/)

```js
const Text = require('gl-text')

let text1 = new Text()

text1.update({
	position: [50, 50],
	text: 'ABC',
	font: '16px Helvetica, sans-serif'
})
text1.render()

// create another text renderer on the same context
let text2 = new Text(text1.gl)
text2.update({
	font: {
		family: ['Helvetica', 'Arial', 'sans-serif'],
		size: '1rem'
	}
})
```

## API

### `let text = Text(gl|regl|canvas|container|options?)`

Create text renderer instance for the WebGL context `gl`, [`regl`](https://ghub.io/regl) instance, `canvas`/`container` element or based on `options`:

Option | Meaning
---|---
`regl` | Existing `regl` instance. By default new one is created.
`gl`/`context` | Existing WebGL context. By default new one is created.
`canvas` | Existing `canvas` element.
`container` | Existing `container` element. By default new canvas is created within the container.

No arguments call creates new fullscreen canvas.

### `text.update(options)`

Update state of a `Text` instance.

Option | Description
---|---
`text` | Text string to print or array of strings.
`position` | Position of the text on the screen or within the `range`, a couple `[x, y]` or array `[[x ,y], [x, y], ...]`.
`align` | Horizontal alignment relative to the `position`. Can be one of `left`, `right`, `center`/`middle`, `start`, `end`, or a number of em units. By default `left`.
`baseline` | Vertical alignment value, by default `middle`. Can be a string one of `top`, `hanging`, `middle`, `alphabetic`, `ideographic`, `bottom` etc. (see [font-measure](https://ghub.io/font-measure)) or a number of em units, denoting `0` as alphabetic baseline.
`font` | Font family, CSS font string or an object with font properties like `{family, size, style}`, see [css-font](https://ghub.io/css-font).
`fontSize`/`em` | Font-size, can be changed independently of `font`.
`range` | Data area corresponding to position in viewport. Useful for organizing zoom/pan. By default is the same as the viewport `[0, 0, canvas.width, canvas.height]`.
`scale`/`translate` | An alternative to `range`.
`viewport` | Visible area within the canvas, an array `[left, top, width, height]` or rectangle `{x, y, width, height}`, see [parse-rect](https://ghub.io/parse-rect).
`kerning` | Enable font kerning, by default `true`. Disable for the case of monospace fonts. See [detect-kerning](https://ghub.io/detect-kerning) package.
`offset` | Shift `position` by the number of ems. Useful for organizing multiple lines, indentation, sub/sup script etc. Does not get affected by `position` change. Can be a number for x-offset only or an array `[x, y]`.

<!-- `direction` | TODO -->
<!-- `letterSpacing`, `tracking` | Distance between letters, fractions of `em`. By default `0`. -->
<!-- `lineHeight`, `leading` | Distance between text lines. -->

### `text.render()`

Draw text.

### `text.destroy()`

Dispose text renderer.

### Properties

* `text.gl` - WebGL context.
* `text.canvas` - canvas element.
* `text.regl` - regl instance.


## License

© 2018 Dmitry Yv. MIT License

Development supported by [plot.ly](https://github.com/plotly/).
