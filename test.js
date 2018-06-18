'use strict'

document.body.style.margin = '0'


const t = require('tape')
const Text = require('./')
const fps = require('fps-indicator')()
const gl = require('gl-util/context')()
const panzoom = require('pan-zoom')


let q = []


t('font', t => {
	let matrix = []

	let family = ['Roboto', 'sans-serif']
	let weights = require('css-font-weight-keywords')
	let stretches = require('css-font-stretch-keywords')

	for (let i = 4; i < weights.length; i++) {
		let weight = weights[i]

		for (let j = 0; j < stretches.length; j++) {
			let stretch = stretches[j]
			let normal = new Text(gl)
			normal.update({
				font: { family, weight, stretch },
				position: [j * 40, i*20],
				text: weight
			})

			q.push(normal)

			// <text gl={gl} position={[j * 40, i * 20]} font={{family, weight, stretch}} text={weight}/>
		}

		for (let j = 0; j < stretches.length; j++) {
			let stretch = stretches[j]
			let italic = new Text(gl)
			italic.update({
				font: { family, weight, stretch, style: 'italic' },
				position: [(stretches.length - 1 + j) * 40, i*20],
				text: weight
			})

			q.push(italic)
		}
	}

	t.end()
})

t.only('alignment', t => {
	let canvas = document.body.appendChild(
		document.createElement('canvas')
	)
	canvas.style.position = 'absolute'
	canvas.style.left = 0
	canvas.style.top = 0
	canvas.width = window.innerWidth
	canvas.height = window.innerHeight
	let ctx = canvas.getContext('2d')

	// +
	ctx.fillStyle = 'black'
	ctx.fillRect(300 - 25, 200, 100, 1)
	ctx.fillRect(300, 200 - 25, 1, 50)
	// ctx.fillStyle = 'blue'
	// ctx.fillStyle = 'rgba(0,0,255,.1)'
	// ctx.fillRect(400, 200 - 37, 100, 75)

	ctx.font = '48px Roboto'
	ctx.textBaseline = 'top'
	ctx.fillText('Queb', 400, 200)

	let topData = ctx.getImageData(400, 200, 100, 100)
	ctx.putImageData(topData, 0, 0)
	let top = findTop(topData)
	// ctx.fillRect(0, top, 100, 1)

	ctx.textBaseline = 'bottom'
	ctx.fillText('Queb', 400, 200)
	let bottomData = ctx.getImageData(400, 100, 100, 100)
	ctx.putImageData(bottomData, 100, 0)
	let bottom = findBottom(bottomData)
	// ctx.fillRect(0, bottom, 100, 1)

	let bottomTop = findTop(bottomData)
	let topBottom = findBottom(topData)
	// ctx.fillRect(0, bottomTop, 100, 1)

	const metrics = require('measure-font')
	let m = metrics({
		text: 'Queb',
		fontSize: '48px',
		lineHeight: 1,
		fontFamily: 'Roboto'
	})
	console.log(m)
	ctx.fillRect(0, -m.median * 48, 100, 1)

	// let topMinusBottom = 100 - (bottomTop - top)
	let topMinusBottom = topBottom + (100 - bottom)
	ctx.fillStyle = 'rgba(0,0,0,.1)'
	ctx.fillRect(0, 0, 100, topMinusBottom)
	ctx.fillRect(100, 100, 100, -topMinusBottom)

	// let metrics =

	function findTop (iData) {
		let data = iData.data
		for (let i = 3; i < data.length; i+=4) {
			let px = data[i]
			if (data[i] !== 0) {
				return Math.floor((i - 3) / 400.)
			}
		}
	}
	function findBottom (iData) {
		let data = iData.data
		for (let i = data.length - 1; i > 0; i -= 4) {
			let px = data[i]
			if (data[i] !== 0) {
				return Math.floor((i - 3) / 400.)
			}
		}
	}

	// +
	ctx.fillStyle = 'black'
	ctx.fillRect(400 - 25, 400, 100, 1)
	ctx.fillRect(400, 400 - 25, 1, 50)

	//
	q.push(new Text({
		gl,
		baseline: 'middle',
		align: 'left',
		color: 'blue',
		font: '48px Roboto',
		position: [400, 400],
		text: '(Qeuick Brown Fox Jumps over the Lazy Dog)'
	}))
	t.end()
})

t.skip('1e6 letters', t => {
	let chars = 'abc'

	for (let i = 0; i < 1e2; i++) {
		for (let j = 0; j < 1e2; j++) {
			q.push(new Text({
				gl,
				text: chars,
				position: [i * 10, j * 10]
			}))
		}
	}
})

t('changing font-size does not trigger text offsets recalc')

t('spacing', t => {
	t.end()
})

t('color')

t('baseline')

t('kerning')

t('spacing')

t('viewport')

t('range')

t('canvas2d performance')

t.skip('Augment chars', t => {
	q.push(new Text({
		gl,
		font: {
			family: 'Minion Pro',
			weight: 200,
			size: 24
		},
		text: 'ABC',
		position: [0, 100]
	}))

	q.push(new Text({
		gl,
		font: {
			family: 'Minion Pro',
			weight: 200,
			size: 24
		},
		text: 'DEFG',
		position: [0, 200]
	}))

	q.push(new Text({
		gl,
		font: {
			family: 'Minion Pro',
			weight: 200,
			size: 32
		},
		text: 'HIJK',
		position: [0, 300]
	}))

	t.end()
})



q.render = function (opts) {
	if (opts) q.forEach(text => text.update(opts))
	q.forEach(text => text.render())
}

setTimeout(() => {
	let vp = q[0].viewport
	let range = [vp.x, vp.y, vp.x + vp.width, vp.y + vp.height]
	q.render()

	panzoom(document.body, e => {
		let canvas = gl.canvas

		let w = canvas.offsetWidth
		let h = canvas.offsetHeight

		let rx = e.x / w
		let ry = e.y / h

		let xrange = range[2] - range[0],
			yrange = range[3] - range[1]

		if (e.dz) {
			let dz = e.dz / w
			range[0] -= rx * xrange * dz
			range[2] += (1 - rx) * xrange * dz

			// range[1] -= ry * yrange * dz
			// range[3] += (1 - ry) * yrange * dz

			range[1] -= (1 - ry) * yrange * dz
			range[3] += ry * yrange * dz
		}

		range[0] -= xrange * e.dx / w
		range[2] -= xrange * e.dx / w
		// range[1] -= yrange * e.dy / h
		// range[3] -= yrange * e.dy / h
		range[1] += yrange * e.dy / h
		range[3] += yrange * e.dy / h

		q.render({ range })
	})
}, 50)
