'use strict'

document.body.style.margin = '0'


const t = require('tape')
const Text = require('./')
const fps = require('fps-indicator')()
const gl = require('gl-util/context')()
const panzoom = require('pan-zoom')


t('font', t => {
	let matrix = []

	let family = ['Roboto', 'sans-serif']
	let weights = require('css-font-weight-keywords')
	let stretches = require('css-font-stretch-keywords')

	console.time(1)
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
			normal.render()
		}

		for (let j = 1; j < stretches.length; j++) {
			let stretch = stretches[j]
			let italic = new Text(gl)
			italic.update({
				font: { family, weight, stretch, style: 'italic' },
				position: [(stretches.length - 1 + j) * 40, i*20],
				text: weight
			})
			italic.render()
		}
	}
	console.timeEnd(1)


	// var text = new Text(gl)

	// text.update({
	// 	font: {
	// 		family: 'Minion Pro',
	// 		size: 24
	// 	},
	// 	kerning: true,
	// 	text: 'Some text with kerning: AVAVAV W.Y.',
	// 	position: [0, 100]
	// })
	// text.render()

	t.end()
})

t('alignment', t => {

	t.end()
})

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
