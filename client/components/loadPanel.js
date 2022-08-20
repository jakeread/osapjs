/*
loadPanel.js

loadcell amp UI

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import { Button } from '../interface/basics.js'
import AutoPlot from '../../client/components/autoPlot.js'

export default function LoadPanel(vm, xPlace, yPlace, name) {
  let title = new Button(xPlace, yPlace, 104, 34, name)
  let loadPlot = new AutoPlot(xPlace + 120, yPlace, 700, 400)
  loadPlot.setHoldCount(1000)
  loadPlot.redraw()

  let lpBtn = new Button(xPlace, yPlace + 50, 104, 14, 'plot load')
  let lp = false
  let lpCount = 0
  lpBtn.onClick(() => {
    if (lp) {
      lp = false
      lpBtn.good('stopped', 500)
    } else {
      let poll = () => {
        if(!lp) return;
        vm.getReading().then((reading) => {
          lpCount ++ 
          loadPlot.pushPt([lpCount, reading[0]])
          loadPlot.redraw() 
          setTimeout(poll, 100)
        }).catch((err) => {
          lp = false 
          console.error(err)
          lpBtn.bad("err", 500)
        })
      }
      lp = true 
      setTimeout(poll, 250)
    }
  })
}