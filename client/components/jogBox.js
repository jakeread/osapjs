/*
jogBox.js

jog input 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import { Button, TextInput, TextBlock } from '../interface/basics.js'

let BTN_RED = 'rgb(242, 201, 201)'
let BTN_GRN = 'rgb(201, 242, 201)'
let BTN_YLW = 'rgb(240, 240, 180)'
let BTN_GREY = 'rgb(242, 242, 242)'
let BTN_HANGTIME = 1000
let BTN_ERRTIME = 2000

function JogBox(xPlace, yPlace, vm) {
    // jog 
    let jogBtn = Button(xPlace, yPlace, 84, 94, 'click-in to jog')
    let jogBigInput = TextInput(xPlace, yPlace + 110, 87, 20, '50.0')
    let jogNormalInput = TextInput(xPlace, yPlace + 140, 87, 20, '1.0')
    let jogSmallInput = TextInput(xPlace, yPlace + 170, 87, 20, '0.1')
    let status = Button(xPlace, yPlace + 200, 84, 14, '...')
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
        vm.motion.awaitMotionEnd().then(() => {
            console.log('jog: set wait time')
            return vm.motion.setWaitTime(10)
        }).then(() => {
            console.log('jog: get pos')
            return vm.motion.getPos()
        }).then((pos) => {
            // aaaah, hotfix for extruder moves, 
            pos.E = 0
            let inc = getIncrement()
            switch (key) {
                case 'left':
                    pos.X -= inc
                    return vm.motion.addMoveToQueue({ position: pos, rate: rate })
                case 'right':
                    pos.X += inc
                    return vm.motion.addMoveToQueue({ position: pos, rate: rate })
                case 'up':
                    if (zDown) {
                        pos.Z += inc
                    } else if (eDown) {
                        pos.E -= inc
                    } else {
                        pos.Y += inc
                    }
                    return vm.motion.addMoveToQueue({ position: pos, rate: rate })
                case 'down':
                    if (zDown) {
                        pos.Z -= inc
                    } else if (eDown) {
                        pos.E += inc
                    } else {
                        pos.Y -= inc
                    }
                    return vm.motion.addMoveToQueue({ position: pos, rate: rate })
                default:
                    console.error('bad key for jog switch')
                    break;
            }
        }).then(() => {
            console.log('jog: await no motion')
            return vm.motion.awaitMotionEnd()
        }).then(() => {
            console.log('jog: set wait time')
            return vm.motion.setWaitTime(1000)
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
                jog('up', 12000)    // to max. 400mm/sec, 
                break;
            case 40:
                jog('down', 12000)
                break;
            case 37:
                jog('left', 12000)
                break;
            case 39:
                jog('right', 12000)
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