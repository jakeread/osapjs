/*
grid.js

... drawing tools 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import DT from './domTools.js'

export default function Grid(){
    // ------------------------------------------------------ PLANE / ZOOM / PAN
  let plane = $('<div>').addClass('plane').get(0)
  let wrapper = $('#wrapper').get(0)
  // odd, but w/o this, scaling the plane & the background together introduces some numerical errs,
  // probably because the DOM is scaling a zero-size plane, or somesuch.
  $(plane).css('background', 'url("/osapjs/client/interface/bg.png")').css('width', '100px').css('height', '100px')
  let cs = 1 // current scale,
  let dft = { s: cs, x: 0, y: 0, ox: 0, oy: 0 } // default transform

  // zoom on wheel
  wrapper.addEventListener('wheel', (evt) => {
    if ($(evt.target).is('input, textarea')) return
    evt.preventDefault()
    evt.stopPropagation()

    let ox = evt.clientX
    let oy = evt.clientY

    let ds
    if (evt.deltaY > 0) {
      ds = 0.025
    } else {
      ds = -0.025
    }

    let ct = DT.readTransform(plane)
    ct.s *= 1 + ds
    ct.x += (ct.x - ox) * ds
    ct.y += (ct.y - oy) * ds

    // max zoom pls thx
    if (ct.s > 1.5) ct.s = 1.5
    if (ct.s < 0.05) ct.s = 0.05
    cs = ct.s
    DT.writeTransform(plane, ct)
    DT.writeBackgroundTransform(wrapper, ct)
  })

  // pan on drag,
  wrapper.addEventListener('mousedown', (evt) => {
    //console.log(evt.target, $(evt.target).is('svg'))
    if (!($(evt.target).is('#wrapper'))) return; // && !($(evt.target).is('svg'))) return
    evt.preventDefault()
    evt.stopPropagation()
    DT.dragTool((drag) => {
      drag.preventDefault()
      drag.stopPropagation()
      let ct = DT.readTransform(plane)
      ct.x += drag.movementX
      ct.y += drag.movementY
      DT.writeTransform(plane, ct)
      DT.writeBackgroundTransform(wrapper, ct)
    })
  })

  // init w/ defaults,
  DT.writeTransform(plane, dft)
  DT.writeBackgroundTransform(wrapper, dft)

  $(wrapper).append(plane)
}