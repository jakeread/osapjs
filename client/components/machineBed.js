/*
machineBed.js

js-dom rep of a machine bed, for 2D-ish CNC... svg, images, etc? 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import dt from '../interface/domTools.js'

// this is apparently... a constant? in graphics? tf?
let mmToPixel = 3 / 0.79375
let pixelToMM = 1 / mmToPixel 

export default function MachineBed(settings){
  // stash machine, render sizes, 
  let mDims = [settings.machineSize[0], settings.machineSize[1]]
  let rDims = [settings.renderWidth, mDims[1]/mDims[0] * settings.renderWidth]
  let machineToRenderScale = rDims[0] / mDims[0]
  let renderToMachineScale = mDims[0] / rDims[0]
  // trash warning
  console.warn(`pixelToMM`, pixelToMM)
  console.warn(`mmToPixel`, mmToPixel)
  console.warn(`machineToRender ${mDims[0]} -> ${rDims[0]}`, machineToRenderScale)
  console.warn(`renderToMachine ${rDims[0]} -> ${mDims[0]}`, renderToMachineScale)
  // get the plane, add the pad, 
  let dom = $('.plane').get(0)
  this.elem = $('<div>')
    .css('position', 'absolute')
    .css('width', `${rDims[0]}px`)
    .css('height', `${rDims[1]}px`)
    .css('background-color', '#fff')
    .css('left', `${settings.xPlace}px`)
    .css('top', `${settings.yPlace}px`)
    .css('border', `1px solid rgb(225, 225, 225)`)
    .get(0)
  $(dom).append(this.elem)
  // hmmm, we should be able to add an svg here, right? 
  this.addLayer = (layer) => {
    console.warn(layer.name)
    // if(layer.name != 'copper_top.gbr') return 
    // viewBox is for aligning layers: 
    // viewBox[0], viewBox[1] is the location of the bottom-left 
    // of the svg, in board coordinates... 
    // viewBox[2] is width, viewBox[3] is height, 
    console.log('view', layer.gerb.viewBox)
    // width and height are the size of the svg in real-world units... 
    console.log('width', layer.gerb.width)
    console.log('height', layer.gerb.height)
    console.log('units', layer.gerb.units)
    // these units / etc are just secondary arrays, we really have 
    // a base SVG with those .attributes... 
    // so if we *don't scale* 
    let elementScale = 1 // mmToPixel * renderToMachineScale //1 //pixelToMM * renderToMachineScale
    console.log(`elementScale`, elementScale)
    let top = layer.gerb.viewBox[0] / 1000 * mmToPixel
    let left = layer.gerb.viewBox[1] / 1000 * mmToPixel 
    console.log(`left`, left)
    console.log(`top`, top)
    layer.elem = $('<div>')
      .css('position', 'absolute')
      .css('left', `${left}px`)
      .css('top', `${top}px`)
//      .css('transform-origin', 'top left')
      .css('transform', `scale(${elementScale})`) // we can use transform to render proper-size (relative our "bed")
      .get(0)
    $(layer.elem).append(layer.gerb.svg)
    $(this.elem).append(layer.elem)
    // OK, those are the svg's ... we want to stack 'em up then, right? 
  }
}