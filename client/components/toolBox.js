/*
toolBox.js

toolchanger UI 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import { Button, EZButton } from '../interface/basics.js'

export default function ToolBox(xPlace, yPlace, size, vm) {
  let noToolBtn = Button(xPlace, yPlace, size - 6, size - 6, 'no tool')
  // make buttons for each,
  let buttons = []
  let count = 0
  for (let tool in vm.tools) {
    count++
    console.log(size * count)
    console.log(count * 20)
    buttons.push(Button(xPlace, yPlace + size * count + count * 10, size - 6, size - 6, tool))
    console.log(vm.tools[tool])
  }

  let handler = async (evt) => {
    // collect lable from the HTML... 
    let toolRequest = evt.target.textContent
    // make sure this is sensible, 
    if (!vm.tools[toolRequest] && toolRequest != 'no tool') { throw new Error("tool button badness") }
    // now... based on our current state, we try to make deltas: 
    if (vm.currentTool.name == 'unknown') {
      if (toolRequest != 'no tool') {
        vm.currentTool = vm.tools[toolRequest]
      } else {
        vm.currentTool = { name: 'no tool' }
      }
    } else if (vm.currentTool.name == toolRequest) {
      console.log("toolchange for same tool req'd")
    } else {
      // the rest of the statemachine is just in vm...
      noToolBtn.yellow(`getting ${toolRequest} ...`)
      try {
        await vm.getTool(toolRequest)
      } catch (err) {
        console.error(err)
        noToolBtn.red('tool err, see console')
      }
    }
    // finally, update draw state?
    this.updateDrawState()
  }

  // attach them 
  noToolBtn.onClick(handler)
  for (let btn in buttons) {
    buttons[btn].onClick(handler)
  }

  this.updateDrawState = () => {
    // color the btns according to machine's selected tool 
    if (vm.currentTool.name == 'no tool') {
      noToolBtn.green('no tool')
    } else {
      noToolBtn.grey('no tool')
    }
    for (let btn of buttons) {
      if (btn.getText() == vm.currentTool.name) {
        btn.green()
      } else {
        btn.grey()
      }
    }
    // check which tool is present in machine-state and draw colors accordingly 
  }

  let stb = new EZButton(xPlace + size + 10, yPlace, size - 6, size - 6, "tc close")
  stb.onClick(() => {
    vm.toolChanger.setLeverState(true).then(() => {
      stb.good("ok")
    }).catch((err) => {
      console.error(err)
      stb.bad("err")
    })
  })

  let stbo = new EZButton(xPlace + size + 10, yPlace + size + 10, size - 6, size - 6, "tc open")
  stbo.onClick(() => {
    vm.toolChanger.setLeverState(false).then(() => {
      stbo.good("ok")
    }).catch((err) => {
      console.error(err)
      stbo.bad("err")
    })
  })

}