'use strict'

const t = require('tape')
const Text = require('./')

document.body.style.background = 'white'
document.body.style.height = '200px'

t('simple case', t => {
	var text = new Text()

	text.update({
		align: 'left',
		baseline: 'top',
		color: 'blue',
		font: {family: 'Roboto'},
		text: 'Hello World!'
	})
	text.render()

	t.end()
})
