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
`text` |
`position` | Position of the text, an array with `[x, y]` or an object with `{x, y}` coordinates.
`align` | Alignment of a text relative to `position`. One of `left`, `right`, `center`, `start`, `end`.
`baseline` | Vertical font alignment. One of `top`, `hanging`, `middle`, `alphabetic`, `ideographic`, `bottom`.
`font` | CSS font string or object with font settings, see [css-font](https://ghub.com/css-font) package.
`kerning` | Enable font kerning, by default `true`. Disable for the case of monospace fonts. See [detect-kerning](https://ghub.io/detect-kerning) package.
`range` | Data area corresponding to position in viewport. Useful for organizing fast zoom/pan. By default is the same as the viewport `[0, 0, canvas.width, canvas.height]`.
`viewport` | Visible area within the canvas, an array `[left, top, width, height]` or rectangle, see [parse-rect](https://ghub.io/parse-rect).
`direction` |
`letter-spacing` |

### `text.render()`

Render frame with the text.

### `text.destroy()`

Dispose text renderer and all the associated resources.


## License

© 2018 Dmitry Yv. MIT License

Development supported by [plot.ly](https://github.com/plotly/).
