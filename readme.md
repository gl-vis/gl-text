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
`position` |
`font` | CSS font string or object with font settings, see [css-font](https://ghub.com/css-font) package.
`kerning` |
`viewport` | Visible area within the canvas.
`range` |
`align` |
`baseline` |
`direction` |
`letter-spacing` |

### `text.render()`

Render frame with the text.

### `text.destroy()`

Dispose text renderer and all the associated resources.


## License

© 2018 Dmitry Yv. MIT License

Development supported by [plot.ly](https://github.com/plotly/).
