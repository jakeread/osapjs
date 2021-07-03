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
import { Button, TextInput } from '../interface/basics.js'
import { AutoPlot } from '../../client/components/autoPlot.js'

export default function TempPanel(vm, xPlace, yPlace, init, name) {
  let title = new Button(xPlace, yPlace, 104, 34, name)

  yPlace += 50 
  let tempSet = new TextInput(xPlace, yPlace, 110, 20, `${init}`)

  let tempSetBtn = new Button(xPlace, yPlace + 30, 104, 14, 'set temp')
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

  let tempCoolBtn = new Button(xPlace, yPlace + 60, 104, 14, 'cooldown')
  tempCoolBtn.onClick(() => {
    vm.setExtruderTemp(0).then(() => {
      tempCoolBtn.good("ok", 500)
    }).catch((err) => {
      console.error(err)
      tempCoolBtn.bad("err", 500)
    })
  })

  let tempPlot = new AutoPlot(xPlace + 120, yPlace - 50, 420, 230)
  tempPlot.setHoldCount(500)
  //tempPlot.setYDomain(0, 100)
  tempPlot.redraw()

  let effortPlot = new AutoPlot(xPlace + 120, yPlace + 240 - 50, 420, 150)
  effortPlot.setHoldCount(500)
  //effortPlot.setYDomain(-10, 10)
  effortPlot.redraw()

  let tempLpBtn = new Button(xPlace, yPlace + 90, 104, 14, 'plot temp')
  let tempLp = false
  let tempLpCount = 0
  tempLpBtn.onClick(() => {
    if (tempLp) {
      tempLp = false
      tempLpBtn.good("stopped", 500)
    } else {
      let poll = () => {
        if (!tempLp) return
        vm.getExtruderTemp().then((temp) => {
          //console.log(temp)
          tempLpCount++
          tempPlot.pushPt([tempLpCount, temp])
          tempPlot.redraw()
          return vm.getExtruderTempOutput()
        }).then((effort) => {
          //console.log(effort)
          effortPlot.pushPt([tempLpCount, effort])
          effortPlot.redraw()
          setTimeout(poll, 100)
        }).catch((err) => {
          tempLp = false
          console.error(err)
          tempLpBtn.bad("err", 500)
        })
      }
      tempLp = true
      poll()
    }
  })

  let pVal = new TextInput(xPlace, yPlace + 120, 110, 20, '-0.1')
  let iVal = new TextInput(xPlace, yPlace + 150, 110, 20, '0.0')
  let dVal = new TextInput(xPlace, yPlace + 180, 110, 20, '0.1')

  let pidSetBtn = new Button(xPlace, yPlace + 210, 104, 14, 'set PID')
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