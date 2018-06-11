# gl-text

Render text in WebGL via [font-atlas](https://ghub.io/font-atlas).


## Usage

[![npm install gl-text](https://nodei.co/npm/gl-text.png?mini=true)](https://npmjs.org/package/gl-text/)

```js
let Text = require('gl-text')()

Text({
	position: [x, y],
	viewport: [],
	text: 'ABC',
	align: '',
	baseline: '',
	direction: '',

	font: 'Helvetica 16px/1.2',
	font: {
		family: ['Helvetica', 'sans-serif']
	}
})
```

## API

### `text = Text(gl|regl|opts?)`

Option | Meaning
---|---
`regl` | Existing `regl` instance. By default [multi-regl](https://github.com) is created.
`gl`, `context` | Existing WebGL context. By default new one is created.
`canvas` |
`container` |

### `text.update(trace1, trace2, ...traces)`

Define passes for `draw` method. Every trace can include the following options:

Option | Description
---|---
`text` |
`position` |
`range` |
`font` |
`kerning` |
`viewport` |
`align` |
`baseline` |
`direction` |

### `text.render()`

### `text.destroy()`

Dispose renderer and all the associated resources.


## License

© 2018 Dmitry Yv. MIT License

Development supported by [plot.ly](https://github.com/plotly/).
