/*
tempPanel.js

temperature / 'heater module' circuit UI 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import DT from '../interface/domTools.js'
import { Button, EZButton, TextInput, TextBlock } from '../interface/basics.js'
import AutoPlot from '../../client/components/autoPlot.js'

export default function TempPanel(vm, xPlace, yPlace, init, name, pidDisplay = false, pcfPresent = false) {
  let title = new TextBlock(xPlace, yPlace, 84, 34, name)

  yPlace += 50
  let tempSet = new TextInput(xPlace, yPlace, 87, 20, `${init}`)

  let tempSetBtn = new EZButton(xPlace, yPlace + 30, 84, 14, 'set temp')
  tempSetBtn.onClick(() => {
    let temp = parseFloat(tempSet.value)
    if (Number.isNaN(temp)) {
      tempSetBtn.bad("parse err", 1000)
      return
    }
    vm.setExtruderTemp(temp).then(() => {
      tempSetBtn.good("ok", 500)
    }).catch((err) => {
      console.error(err)
      tempSetBtn.bad("err", 1000)
    })
  })

  let tempCoolBtn = new EZButton(xPlace, yPlace + 60, 84, 14, 'cooldown')
  tempCoolBtn.onClick(() => {
    vm.setExtruderTemp(0).then(() => {
      tempCoolBtn.good("ok", 500)
    }).catch((err) => {
      console.error(err)
      tempCoolBtn.bad("err", 500)
    })
  })

  let tempPlot = new AutoPlot(xPlace + 100, yPlace - 50, 300, 230,
    `${name} temp`, { top: 40, right: 20, bottom: 30, left: 40 })
  tempPlot.setHoldCount(500)
  tempPlot.setYDomain(0, init + 20)
  tempPlot.redraw()

  let effortPlot = {}

  if (pidDisplay) {
    effortPlot = new AutoPlot(xPlace + 100, yPlace + 240 - 50, 300, 150,
      `${name} heater effort`, { top: 40, right: 20, bottom: 30, left: 40 })
    effortPlot.setHoldCount(500)
    //effortPlot.setYDomain(-10, 10)
    effortPlot.redraw()
  }

  let tempLpBtn = new Button(xPlace, yPlace + 90, 84, 44, 'plot temp')
  let tempLp = false
  let tempLpCount = 0
  let tempLpRun = async () => {
    if (!tempLp) return
    tempLpBtn.green('temp updating...')
    try {
      let temp = await vm.getExtruderTemp()
      tempLpCount++
      tempPlot.pushPt([tempLpCount, temp])
      tempPlot.redraw()
    } catch (err) {
      tempLp = false
      console.error(err)
      tempLpBtn.red('temp update err, see console', 500)
    }
    if (pidDisplay) {
      try {
        let effort = await vm.getExtruderTempOutput()
        effortPlot.pushPt([tempLpCount, effort])
        effortPlot.redraw()
      } catch (err) {
        tempLp = false
        console.error(err)
        tempLpBtn.red('temp update err, see console', 500)
      }
    }
    setTimeout(tempLpRun, 200)
  }
  tempLpBtn.onClick(() => {
    if (tempLp) {
      tempLp = false
      tempLpBtn.grey('plot temp')
    } else {
      tempLp = true
      tempLpRun()
    }
  })

  if (pidDisplay) {
    let pVal = new TextInput(xPlace, yPlace + 150, 87, 20, '-0.1')
    let iVal = new TextInput(xPlace, yPlace + 180, 87, 20, '0.0')
    let dVal = new TextInput(xPlace, yPlace + 210, 87, 20, '0.1')

    let pidSetBtn = new EZButton(xPlace, yPlace + 240, 84, 14, 'set PID')
    pidSetBtn.onClick(() => {
      let p = parseFloat(pVal.value)
      let i = parseFloat(iVal.value)
      let d = parseFloat(dVal.value)
      if (Number.isNaN(p) || Number.isNaN(i) || Number.isNaN(d)) {
        pidSetBtn.bad("bad parse", 1000)
        return
      }
      vm.setPIDTerms([p, i, d]).then(() => {
        pidSetBtn.good("ok", 500)
      }).catch((err) => {
        console.error(err)
        pidSetBtn.bad("err", 1000)
      })
    })
  }

  let pcfSetVal = 0;
  if (pcfPresent){
    let pcfBtn = new EZButton(xPlace, yPlace + 150, 84, 14, 'set pcf')
    pcfBtn.onClick(() => {
      if(pcfSetVal){
        pcfSetVal = 0;
      } else {
        pcfSetVal = 1;
      }
      vm.setPCF(pcfSetVal).then(() => {
        pcfBtn.good("ok")
      }).catch((err) => {
        console.error(err)
        pcfBtn.bad("err")
      })
    })
  }

}