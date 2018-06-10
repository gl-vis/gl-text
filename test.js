'use strict'

const t = require('tape')
const Text = require('./')
const gl = require('gl-util/context')()

document.body.style.margin = '0'

t('simple case', t => {
	var text = new Text(gl)

	text.update({
		align: 'left',
		baseline: 'top',
		color: 'blue',
		font: {family: 'sans-serif', size: 18},
		text: 'Hello World!',
		position: [0, 10]
	})

	text.render()

	t.end()
})


t('case 2' , t => {
	var text = new Text(gl)

	text.update({
		align: 'left',
		baseline: 'top',
		color: 'blue',
		font: {family: 'sans-serif', size: 34},
		text: 'Hello asdhfkjqrewoi!',
		position: [0, 50]
	})

	text.render()

	var text = new Text(gl)

	text.update({
		align: 'left',
		baseline: 'top',
		color: 'blue',
		font: {family: 'Minion Pro', size: 48},
		text: 'Hello W.AVA!',
		position: [0, 100]
	})

	text.render()

	t.end()
})
