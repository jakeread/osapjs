/*
domain.js

click-to-go, other virtual machine dwg 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import dt from '../interface/domTools.js'

export default function Pad(xPlace, yPlace, width, height, machineX = 100, machineY = 100) {
  // machine size : pixel size
  let psize = [width, height]
  let msize = [machineX, machineY]
  let scale = [msize[0] / psize[0], msize[1] / psize[1]]
  // setup the pad
  let dom = $('.plane').get(0)
  let pad = $('<div>').addClass('pad').get(0)
  $(pad).css('background-color', '#c9e5f2').css('width', `${psize[0]}px`).css('height', `${psize[1]}px`)
  $(dom).append(pad)
  let dft = { s: 1, x: xPlace, y: yPlace, ox: 0, oy: 0 }
  dt.writeTransform(pad, dft)
  // drawing lines, 
  let pts = [] // [[x,y],[]]
  let pos = [0,0]
  this.redraw = () => {
    $(pad).children('.svgcont').remove() // rm all segs 
    for (let p = 1; p < pts.length; p++) {
      let del = [pts[p - 1][0] - pts[p][0], pts[p - 1][1] - pts[p][1]]
      $(pad).append(dt.svgLine(
        pts[p][0] / scale[0], psize[1] - pts[p][1] / scale[1],
        del[0] / scale[0], - del[1] / scale[1]
      ))
    }
    this.drawPosition(pos)
  }

  this.onNewTarget = (pos) => {
    console.warn('bind this')
  }

  // also bind-able 
  this.onDragTarget = (pos) => {}
  this.onUp = (pos) => {}

  this.addPoint = (pt) => {
    //console.log('draw', pt)
    pts.push(pt)
    if (pts.length > 2500) pts.shift()
    //drawPts()
  }

  this.drawPosition = (pt) => {
    pos = [pt[0],pt[1]]
    $(pad).children('#ptagID').remove()
    $(pad).append(dt.svgLine(
      pos[0] / scale[0], psize[1] - pos[1] / scale[1],
      10, 10,
      1, 'ptagID'
    ))
  }

  // handle clicks 
  pad.addEventListener('mousedown', (evt) => {
    if (evt.target != pad) return
    // scaled to machine spec, and invert y pixels -? logical 
    let pos = [evt.layerX * scale[0], machineY - evt.layerY * scale[1]]
    //console.warn(`X: ${pos[0].toFixed(2)}, Y: ${pos[1].toFixed(2)}`)
    this.onNewTarget(pos)
    // also do

    document.addEventListener('mousemove', moveListener)
    document.addEventListener('mouseup', upListener)
  })

  let moveListener = (evt) => {
    if(evt.target != pad) return
    let pos = [evt.layerX * scale[0], machineY - evt.layerY * scale[1]]
    this.onDragTarget(pos)
  }

  let upListener = (evt) => {
    if(evt.target != pad) return
    let pos = [evt.layerX * scale[0], machineY - evt.layerY * scale[1]]
    this.onUp(pos)
    document.removeEventListener('mousemove', moveListener)
    document.removeEventListener('mouseup', upListener)
  }
}