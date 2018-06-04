'use strict'

const t = require('tape')
const Text = require('./')

t('simple case', t => {
	var text = new Text({container: document.body, text: 'Hello world!'})

	text.render()

	t.end()
})
