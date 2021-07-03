/*
torqueBox.js

ye olden code from stepper motor by-effort application, 
but contains useful examples 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { Button, TextInput } from '../interface/basics.js'

function TorqueBox(xPlace, yPlace, vm) {
    // jog 
    let jogBtn = Button(xPlace, yPlace, 104, 104, 'click-in to jog')
    let jogBigInput = TextInput(xPlace + 120, yPlace, 60, 20, '10.0')
    let jogNormalInput = TextInput(xPlace + 120, yPlace + 30, 60, 20, '1.0')
    let jogSmallInput = TextInput(xPlace + 120, yPlace + 60, 60, 20, '0.1')
    let status = Button(xPlace + 120, yPlace + 90, 54, 14, '...')
    // key status 
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
        console.log(smallDown, normalDown, bigDown)
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
    let jog = (key) => {
        let tq = getIncrement()
        switch (key) {
            case 'left':
                vm.setTorque(-tq)
                break;
            case 'right':
                vm.setTorque(tq)
                break;
            default:
                console.error("bad key", key)
        }
    }
    // key listeners 
    this.keyDownListener = (evt) => {
        if (evt.repeat) return
        //console.log('keydown', evt.keyCode)
        switch (evt.keyCode) {
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
                jog('up')
                break;
            case 40:
                jog('down')
                break;
            case 37:
                jog('left')
                break;
            case 39:
                jog('right')
                break;
            default:
                break;
        }
    }
    // up 
    this.keyUpListener = (evt) => {
        //console.log('keyup', evt.keyCode)
        switch (evt.keyCode) {
            case 37:
            case 39:
            case 40:
            case 38:
                vm.setTorque(0)
                break;
            case 90:
                setZ(false);
                break;
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

export { TorqueBox }