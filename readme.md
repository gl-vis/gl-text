# regl-text

Text renderer for regl.


## Usage

[![npm install regl-text](https://nodei.co/npm/regl-text.png?mini=true)](https://npmjs.org/package/regl-text/)

```js
let Text = require('regl-text')()

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
	},

	mode: 'texture'
})
```

## API

### `text = createText(gl|regl|opts?)`

Creates scatter matrix instance. `opts` take all [gl-component](https://github.com/a-vis/gl-component)

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

### `text.draw(...ids?|...points?)`

Draw all defined passes, or only selected ones provided by `ids`. Optionally define point indexes to render.

```js
// draw 1 and 3 passes
text.draw(1, 3)

// draw 1, 2 and 3 points from the first pass and 3 point from the second pass
text.draw([1, 2, 3], [3])
```

### `text.destroy()`

Dispose renderer and all the associated resources

## Related

* [regl-scatter2d](https://github.com/dy/regl-scatter2d)
* [regl-line2d](https://github.com/dy/regl-line2d)
* [regl-error2d](https://github.com/dy/regl-error2d)


## License

© 2018 Dmitry Yv. MIT License

Development supported by [plot.ly](https://github.com/plotly/).
