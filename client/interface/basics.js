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

// (svg)esus
function svgRenderer(xPlace, yPlace, width, height, svg){
  let elem = $('<div>').css('position', 'absolute').get(0)
  $(elem).append(svg) 
  DT.placeField(elem, width, height, xPlace, yPlace)
}

// single action buttons, 
function EZButton(xPlace, yPlace, width, height, text) {
  let elem = $('<div>').addClass('button')
    .text(text)
    .get(0)
  DT.placeField(elem, width - 6, height - 6, xPlace, yPlace)
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
function Button(settings, justify) {
  let xPlace = settings.xPlace 
  let yPlace = settings.yPlace 
  let width = settings.width 
  let height = settings.height 
  let defaultText = settings.defaultText 
  let elem = $('<div>').addClass('button')
    .text(defaultText)
    .get(0)
  if (justify) {
    $(elem).css('justify-content', 'left').css('padding-left', '10px')
    width -= 7
  }
  DT.placeField(elem, width -6, height - 6, xPlace, yPlace)
  let btn = {}
  btn.elem = elem 
  btn.onClick = (fn) => {
    $(elem).off('click')
    $(elem).on('click', (evt) => { fn(evt) })
  }
  btn.setText = (text) => {
    $(elem).text(text)
  }
  btn.resetText = () => {
    $(elem).text(defaultText)
  }
  btn.getText = () => {
    return $(elem).text()
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
  btn.remove = () => {
    $(elem).remove()
  }
  return btn
}

// for ahn slider, 
function Slider(settings){
  if(!settings.min) settings.min = -1;
  if(!settings.max) settings.max = 1;
  if(!settings.step) settings.step = 0.01;
  if(!settings.dflt) settings.dflt = 0;
  if(!settings.title) settings.title = "slider"
  let elem = $(`<input type="range" min=${settings.min} max=${settings.max} step=${settings.step} value=${settings.dflt}>`).addClass('inputwrap')
    .text(settings.title)
    .get(0)
  DT.placeField(elem, settings.width - 100, settings.height, settings.xPlace, settings.yPlace)
  let btn = new Button(settings.xPlace + settings.width - 80, settings.yPlace, 80, settings.height, elem.value)
  btn.setHTML(`${settings.title}<br>${elem.value}`)
  btn.onClick(() => {
    elem.value = settings.dflt;
    elem.oninput()
  })
  let slider = { elem: elem }
  elem.oninput = () => { 
    btn.setHTML(`${settings.title}<br>${elem.value}`)
    if(slider.onChange) slider.onChange(elem.value) 
  }
  return slider 
}

// text blocks 
function TextBlock(settings, justify = false) {
  let xPlace = settings.xPlace 
  let yPlace = settings.yPlace 
  let width = settings.width 
  let height = settings.height 
  let text = settings.defaultText 
  let elem = $('<div>').addClass('inputwrap')
    .text(text)
    .get(0)
  if (justify) {
    $(elem)
      .css('justify-content', 'left')
      .css('padding-left', '10px')
      .css('padding-top', '10px')
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

export { Button, EZButton, Slider, TextInput, TextBlock, svgRenderer }