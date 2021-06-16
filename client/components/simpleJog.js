/*
simpleJog.js

better jog, for use w/ accel-integrating... 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import { EZButton } from '../interface/button.js'

export default function SimpleJog(xPlace, yPlace, vm){

    // rate

    let jogAccel = 10 

    // ------------------------------------------ buttons 

    let leftBtn = EZButton(xPlace, yPlace, 14, 84, '<')
    let midBtn = EZButton(xPlace + 30, yPlace, 84, 84, 'click-in to jog')
    let rightBtn = EZButton(xPlace + 130, yPlace, 14, 84, '>')

    // ------------------------------------------ buf of moves

    let buf = [] 
    let bufRunning = false 
    
    let bufAdd = (move) => {
        buf.push(move)
        if(buf.length == 1){
            bufRun()
        }
    }

    let bufMoveComplete = () => {
        bufRunning = false 
        bufRun()
    }
    
    let bufRun = () => {
        if(buf.length == 0 || bufRunning) return;
        let move = buf.shift()
        bufRunning = true 
        switch(move){
            case "left_down":
                vm.setAccel(-jogAccel).then(() => {
                    bufMoveComplete()
                }).catch(bufError)
                break;
            case "left_up":
                vm.setAccel(0).then(() => {
                    bufMoveComplete()
                }).catch(bufError)
                break;
            case "right_down":
                vm.setAccel(jogAccel).then(() => {
                    bufMoveComplete()
                }).catch(bufError)
                break;
            case "right_up":
                vm.setAccel(0).then(() => {
                    bufMoveComplete()
                }).catch(bufError)
                break;
            default:
                throw new Error("unrecognized move in jog buf")
        }
    }
    
    let bufError = (err) => {
        console.error('during jog, error below:')
        console.error(err)
        buf.length = 0 
    }

    // ------------------------------------------ button clicks 

    leftBtn.onClick(() => {
        down("left")
        setTimeout(() => {
            up("left")
        }, 200)
    })

    rightBtn.onClick(() => {
        down("right")
        setTimeout(() => {
            up("right")
        }, 200)
    })

    // ------------------------------------------ actions... should buf ? 

    let down = (dir) => {
        switch(dir){
            case "left":
                leftBtn.green()
                bufAdd('left_down')
                break;
            case "right":
                rightBtn.green()
                bufAdd('right_down')
                break;
            default:
                break;
        }
    }

    let up = (dir) => {
        switch(dir){
            case "left":
                leftBtn.grey()
                bufAdd('left_up')
                break;
            case "right":
                rightBtn.grey()
                bufAdd('right_up')
                break;
            default:
                break;
        }
    }

    // ------------------------------------------ keydown states 

    let keyStatus = false
    midBtn.onClick(() => {
        if(keyStatus){
            keyStatus = false
            removeKeys()
        } else {
            keyStatus = true
            setupKeys()
        }
    })

    let keyDown = (evt) => {
        if(evt.repeat) return;
        switch(evt.keyCode){
            case 37:
                down('left')
                break;
            case 39:
                down('right')
                break;
            default:
                break;
        }
    }

    let keyUp = (evt) => {
        switch(evt.keyCode){
            case 37:
                up('left')
                break;
            case 39:
                up('right')
                break;
            default:
                break;
        }
    }

    let setupKeys = () => {
        midBtn.green() 
        document.addEventListener('keydown', keyDown)
        document.addEventListener('keyup', keyUp)
    }

    let removeKeys = () => {
        midBtn.grey()
        document.removeEventListener('keydown', keyDown)
        document.removeEventListener('keyup', keyUp)
    }

}
