'use strict'

const t = require('tape')
const Text = require('./')

document.body.style.background = 'white'

t('simple case', t => {
	var text = new Text({container: document.body})

	text.update({
		align: 'left',
		baseline: 'top',
		color: 'blue',
		font: {family: ['Roboto', 'serif']},
		text: 'Hello alaska!'
	})
	text.render()

	t.end()
})
