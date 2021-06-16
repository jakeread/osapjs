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
import style from '../interface/style.js'

function Button(xPlace, yPlace, width, height, text) {
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
        if(!time) time = 500
        $(elem).text(msg).css('background-color', style.grn)
        setTimeout(() => {
            $(elem).text(text).css('background-color', style.grey)
        }, time)
    }
    btn.bad = (msg, time) => {
        if(!time) time = 500 
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

export { Button }