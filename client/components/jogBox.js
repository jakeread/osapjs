/*
gCodePanel.js

input gcodes 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

/*
notes on this thing

this is pretty straightforward at the moment, it'll read small gcodes
i.e. those used to mill circuits. for larger files, like 3DP files,
reading times / manipulating large streams of texts needs to be handled 
more intelligently, i.e. not rendering the whole file into the 'incoming' body. 

*/

'use strict'

import DT from '../interface/domTools.js'

function Button(xPlace, yPlace, width, height, text) {
    let btn = $('<div>').addClass('button')
        .text(text)
        .get(0)
    placeField(btn, width, height, xPlace, yPlace)
    return btn
}

function TextInput(xPlace, yPlace, width, height, text) {
    let input = $('<input>').addClass('inputwrap').get(0)
    input.value = text
    placeField(input, width, height, xPlace, yPlace)
    return input
}

let BTN_RED = 'rgb(242, 201, 201)'
let BTN_GRN = 'rgb(201, 242, 201)'
let BTN_YLW = 'rgb(240, 240, 180)'
let BTN_GREY = 'rgb(242, 242, 242)'
let BTN_HANGTIME = 1000
let BTN_ERRTIME = 2000

function JogBox(xPlace, yPlace, vm) {
    // jog 
    let jogBtn = Button(xPlace, yPlace, 104, 104, 'click-in to jog')
    let jogBigInput = TextInput(xPlace + 120, yPlace, 60, 20, '50.0')
    let jogNormalInput = TextInput(xPlace + 120, yPlace + 30, 60, 20, '1.0')
    let jogSmallInput = TextInput(xPlace + 120, yPlace + 60, 60, 20, '0.1')
    let status = Button(xPlace + 120, yPlace + 90, 54, 14, '...')
    // key status 
    let eDown = false;
    let setE = (bool) => {
        eDown = bool 
        if(eDown){
            $(status).text('e')
        } else {
            $(status).text('xy')
        }
    }
    let zDown = false;
    let setZ = (bool) => {
        zDown = bool
        if (zDown) {
            $(status).text('z')
        } else {
            $(status).text('xy')
            // do... 
        }
    }
    let bigDown = false;
    let setBig = (bool) => {
        bigDown = bool
        if (bigDown) {
            setSmall(false)
            setNormal(false)
            $(jogBigInput).css('background-color', BTN_GRN)
        } else {
            $(jogBigInput).css('background-color', BTN_GREY)
        }
    }
    let normalDown = false;
    let setNormal = (bool) => {
        normalDown = bool
        if (normalDown) {
            setSmall(false)
            setBig(false)
            $(jogNormalInput).css('background-color', BTN_GRN)
        } else {
            $(jogNormalInput).css('background-color', BTN_GREY)
        }
    }
    let smallDown = false;
    let setSmall = (bool) => {
        smallDown = bool
        if (smallDown) {
            setNormal(false)
            setBig(false)
            $(jogSmallInput).css('background-color', BTN_GRN)
        } else {
            $(jogSmallInput).css('background-color', BTN_GREY)
        }
    }
    // clear 
    let noneDown = () => {
        setNormal(false)
        setBig(false)
        setSmall(false)
    }
    // action
    let parseOrReject = (numstr) => {
        let val = parseFloat(numstr)
        if (Number.isNaN(val)) {
            return 0
        } else {
            return val
        }
    }
    let getIncrement = () => {
        let val = 0
        // console.log(smallDown, normalDown, bigDown)
        if (smallDown) {
            return parseOrReject(jogSmallInput.value)
        } else if (normalDown) {
            return parseOrReject(jogNormalInput.value)
        } else if (bigDown) {
            return parseOrReject(jogBigInput.value)
        } else {
            console.error('no increment selected, statemachine borked')
            return 0
        }
    }
    let jog = (key, rate) => {
        $(jogBtn).text('...').css('background-color', BTN_YLW)
        console.log('jog: await no motion')
        vm.awaitMotionEnd().then(() => {
            console.log('jog: set wait time')
            return vm.setWaitTime(10)
        }).then(() => {
            console.log('jog: get pos')
            return vm.getPos()
        }).then((pos) => {
            console.log(pos, 'add move')
            // aaaah, hotfix for extruder moves, 
            pos.E = 0
            let inc = getIncrement()
            switch (key) {
                case 'left':
                    pos.X -= inc
                    return vm.addMoveToQueue({ position: pos, rate: rate })
                case 'right':
                    pos.X += inc
                    return vm.addMoveToQueue({ position: pos, rate: rate })
                case 'up':
                    if (zDown) {
                        pos.Z += inc
                    } else if (eDown) {
                        pos.E -= inc
                    } else {
                        pos.Y += inc
                    }
                    return vm.addMoveToQueue({ position: pos, rate: rate })
                case 'down':
                    if (zDown) {
                        pos.Z -= inc
                    } else if (eDown) {
                        pos.E += inc
                    } else {
                        pos.Y -= inc
                    }
                    return vm.addMoveToQueue({ position: pos, rate: rate })
                default:
                    console.error('bad key for jog switch')
                    break;
            }
        }).then(() => {
            console.log('jog: await no motion')
            return vm.awaitMotionEnd()
        }).then(() => {
            console.log('jog: set wait time')
            return vm.setWaitTime(1000)
        }).then(() => {
            console.log('jog: restart jog')
            this.restart()
        }).catch((err) => {
            console.error(err)
            $(jogBtn).text('err').css('background-color', BTN_RED)
            setTimeout(() => { this.restart() }, BTN_ERRTIME)
        })
    }
    // key listeners 
    this.keyDownListener = (evt) => {
        if (evt.repeat) return
        switch (evt.keyCode) {
            case 69:
                setE(true)
                break;
            case 90:
                setZ(true)
                break;
            case 88:
                setBig(true)
                break;
            case 67:
                setSmall(true)
                break;
            case 38:
                jog('up', 24000)    // to max. 400mm/sec, 
                break;
            case 40:
                jog('down', 24000)
                break;
            case 37:
                jog('left', 24000)
                break;
            case 39:
                jog('right', 24000)
                break;
            default:
                break;
        }
    }
    // up 
    this.keyUpListener = (evt) => {
        //console.log('keyup', evt.keyCode)
        switch (evt.keyCode) {
            case 69:
                setE(false);
            case 90:
                setZ(false);
            case 88:
                setBig(false)
                setNormal(true)
                break;
            case 67:
                setSmall(false)
                setNormal(true)
                break;
            default:
                break;
        }
    }
    // in-to-state
    this.start = () => {
        jogBtn.clicked = true
        $(jogBtn).css('background-color', BTN_GRN)
        $(jogBtn).html('x: big<br>c: small<br>z: map y to z')
        $(status).text('xy')
        document.addEventListener('keydown', this.keyDownListener)
        document.addEventListener('keyup', this.keyUpListener)
        if (bigDown) {
            setBig(true)
        } else if (smallDown) {
            setSmall(true)
        } else {
            setNormal(true)
        }
        if (zDown) {
            $(status).text('z')
        }
    }
    // out-of 
    this.stop = () => {
        jogBtn.clicked = false
        $(jogBtn).html('click-in to jog')
        $(jogBtn).css('background-color', BTN_GREY)
        $(status).text('...')
        noneDown()
        document.removeEventListener('keydown', this.keyDownListener)
        document.removeEventListener('keyup', this.keyUpListener)
    }
    // restart w/ varied button-down state 
    this.restart = () => {
        if (jogBtn.clicked) {
            this.start()
        } else {
            this.stop()
        }
    }
    // go big 
    this.select
    // ok, statemachine 
    $(jogBtn).on('click', (evt) => {
        if (!jogBtn.clicked) {
            this.start()
        } else {
            this.stop()
        }
    })
}

export { JogBox }

// lifted from https://github.com/cncjs/gcode-parser/blob/master/src/index.js
const stripComments = (() => {
    const re1 = new RegExp(/\s*\([^\)]*\)/g); // Remove anything inside the parentheses
    const re2 = new RegExp(/\s*;.*/g); // Remove anything after a semi-colon to the end of the line, including preceding spaces
    const re3 = new RegExp(/\s+/g);
    return (line => line.replace(re1, '').replace(re2, '').replace(re3, ''));
})()
const re = /(%.*)|({.*)|((?:\$\$)|(?:\$[a-zA-Z0-9#]*))|([a-zA-Z][0-9\+\-\.]+)|(\*[0-9]+)/igm

let pullAxes = (str) => {
    const whiteSpace = new RegExp(/\s*/g)
    str = str.replace(whiteSpace, '')
    return str.split(',')
}

let placeField = (field, width, height, xpos, ypos) => {
    $(field).css('position', 'absolute')
        .css('border', 'none')
        .css('width', `${width}px`)
        .css('height', `${height}px`)
    $($('.plane').get(0)).append(field)
    let dft = { s: 1, x: xpos, y: ypos, ox: 0, oy: 0 }
    DT.writeTransform(field, dft)
}

// startup with demo gcode, for testing 
let initWith = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject('no startup file, ok')
            return
        }
        $.ajax({
            type: "GET",
            url: file,
            error: function () { reject(`req for ${file} fails`) },
            success: function (xhr, statusText) {
                resolve(xhr)
            }
        })
    })
}
