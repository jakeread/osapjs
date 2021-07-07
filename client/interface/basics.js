/*
button.js

for real, a button class

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import DT from './domTools.js'
import style from './style.js'

// single action buttons, 
function EZButton(xPlace, yPlace, width, height, text) {
  let elem = $('<div>').addClass('button')
    .text(text)
    .get(0)
  DT.placeField(elem, width, height, xPlace, yPlace)
  let btn = {}
  btn.onClick = (fn) => {
    $(elem).on('click', (evt) => {
      fn()
      $(elem).text('...').css('background-color', style.ylw)
    })
  }
  btn.good = (msg, time) => {
    if (!time) time = 500
    $(elem).text(msg).css('background-color', style.grn)
    setTimeout(() => {
      $(elem).text(text).css('background-color', style.grey)
    }, time)
  }
  btn.bad = (msg, time) => {
    if (!time) time = 500
    $(elem).text(msg).css('background-color', style.red)
    setTimeout(() => {
      $(elem).text(text).css('background-color', style.grey)
    }, time)
  }
  btn.setText = (text) => {
    $(elem).text(text)
  }
  btn.elem = elem
  return btn
}

// for more complex / set button state yourself 
function Button(xPlace, yPlace, width, height, defaultText, justify) {
  let elem = $('<div>').addClass('button')
    .text(defaultText)
    .get(0)
  if (justify) {
    $(elem).css('justify-content', 'left').css('padding-left', '10px')
    width -= 7
  }
  DT.placeField(elem, width, height, xPlace, yPlace)
  let btn = {}
  btn.onClick = (fn) => {
    $(elem).on('click', (evt) => { fn() })
  }
  btn.setText = (text) => {
    $(elem).text(text)
  }
  btn.setHTML = (html) => {
    $(elem).html(html)
  }
  btn.green = (text) => {
    if (text) $(elem).text(text)
    $(elem).css('background-color', style.grn)
  }
  btn.yellow = (text) => {
    if (text) $(elem).text(text)
    $(elem).css('background-color', style.ylw)
  }
  btn.red = (text) => {
    if (text) $(elem).text(text)
    $(elem).css('background-color', style.red)
  }
  btn.grey = (text) => {
    if (text) $(elem).text(text)
    $(elem).css('background-color', style.grey)
  }
  return btn
}

// text blocks 
function TextBlock(xPlace, yPlace, width, height, text, justify) {
  let elem = $('<div>').addClass('textBlock')
    .text(text)
    .get(0)
  if (justify) {
    $(elem).css('justify-content', 'left').css('padding-left', '10px')
    width -= 7
  }
  DT.placeField(elem, width, height, xPlace, yPlace)
  let blk = {}
  blk.setText = (text) => {
    $(elem).text(text)
  }
  blk.setHTML = (html) => {
    $(elem).html(html)
  }
  blk.green = (text) => {
    if (text) $(elem).text(text)
    $(elem).css('background-color', style.grn)
  }
  blk.red = (text) => {
    if (text) $(elem).text(text)
    $(elem).css('background-color', style.red)
  }
  blk.grey = (text) => {
    if (text) $(elem).text(text)
    $(elem).css('background-color', style.grey)
  }
  return blk
}

// text inputs 
function TextInput(xPlace, yPlace, width, height, text) {
  let input = $('<input>').addClass('inputwrap').get(0)
  input.value = text
  DT.placeField(input, width, height, xPlace, yPlace)
  input.green = () => {
    $(input).text(text).css('background-color', style.grn)
  }
  input.red = () => {
    $(input).text(text).css('background-color', style.red)
  }
  input.grey = () => {
    $(input).text(text).css('background-color', style.grey)
  }
  input.getValue = () => {
    return input.value
  }
  input.getNumber = () => {
    let val = parseFloat(input.value)
    if (Number.isNaN(val)) {
      return 0
    } else {
      return val
    }
  }
  // could do: input.getNum() returning err if bad parse (?) 
  return input
}

export { Button, EZButton, TextInput, TextBlock }