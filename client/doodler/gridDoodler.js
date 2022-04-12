/*
gridDoodler.js

tool to draw *grids* explicitly (!) not meshes 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import DT from '../interface/domTools.js'
import { VT, TIMES } from '../../core/ts.js'

let padSize = 150 // square 
let padPadding = 10

export default function GridDoodler(xPlace, yPlace) {
  this.redraw = (graph) => {
    // rm all old, 
    $('.node').remove()
    // for this one, we should recurse by root, right?
    let drawTime = TIMES.getTimeStamp()
    let recursor = (root, x, y) => {
      // don't draw forever 
      if (root.lastDrawTime == drawTime){
        console.log(`avoids redrawing ${root.name}`)
        return;
      }
      root.lastDrawTime = drawTime
      // I guess I want some idea of a shape... 
      // draw this pad, 
      this.drawPad(x, y, root.name)
      // check vports, 
      for (let c = 0; c < root.children.length; c ++) {
        if (root.children[c].type == VT.VPORT) {
          // could draw the actual vport, then:
          if (root.children[c].reciprocal && root.children[c].reciprocal.parent) {
            // let's see... 0, 1 draw *above*
            // but this depends on our orientation, right? 
            let nx = x
            let ny = y
            if(root.name == "embedded-root"){
              switch (c) {
                case 0:
                case 1:
                  ny--
                  break;
                case 2:
                  nx--
                  break;
                case 3:
                  ny++
                  break;
                case 4:
                  nx++
                  break;
                default:
                  console.warn("wut?")
              }  
            } else {
              switch(c){
                case 0: 
                  ny ++;
                  break;
                case 1: 
                  ny ++;
                  break;
                default: 
                  console.warn("what?")
              }
            }
            recursor(root.children[c].reciprocal.parent, nx, ny)
            // assuming same orientation, 1 is north, 2 west, 3 south, 4 east 
          }
        }
      }
    }
    recursor(graph, 0, 0)
  }

  this.drawPad = (x, y, name = "pad") => {
    let pad = $('<div>').addClass('node').text(name).get(0)
    DT.placeField(pad, padSize, padSize,
      xPlace + x * padSize + x * padPadding,
      yPlace + y * padSize + y * padPadding)
  }
}