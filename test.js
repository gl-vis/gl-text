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

		for (let j = 1; j < stretches.length; j++) {
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

		for (let j = 1; j < stretches.length; j++) {
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

t('alignment', t => {
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
	ctx.fillRect(canvas.width / 2 - 25, canvas.height / 2, 100, 1)
	ctx.fillRect(canvas.width / 2, canvas.height / 2 - 25, 1, 50)

	q.push(new Text({
		gl,
		baseline: 'top',
		align: 'left',
		color: '#000',
		font: '48px Roboto',
		// position: [1, 1],
		// range: [0,0,2,2],
		text: 'Middle'
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

t('tracking (spacing)')

t('viewport')

t('range')

t('line breaks')

t('ignore spaces')

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
	// let range = q[0].range
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
