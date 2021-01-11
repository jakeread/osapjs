/*
textInput.js

stub,

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import DT from './domTools.js'

function TextInput(xPlace, yPlace, width, height, text) {
    let input = $('<input>').addClass('inputwrap').get(0)
    input.value = text
    DT.placeField(input, width, height, xPlace, yPlace)
    return input
}

export { TextInput }