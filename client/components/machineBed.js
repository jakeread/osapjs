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

import { Button, TextBlock } from '../interface/basics.js'
import dt from '../interface/domTools.js'
import gerberConverter from './gerberConverter.js'
import ImgToPath2D from './img2path.js'

// this is apparently... a constant? in graphics? tf?
let mmToPixel = 3 / 0.79375
let pixelToMM = 1 / mmToPixel

export default function MachineBed(settings, machine) {
  // -------------------------------------------- Build the Pad... 
  // stash machine, render sizes, 
  let mDims = [settings.machineSize[0], settings.machineSize[1]]
  let rDims = [settings.renderWidth, mDims[1] / mDims[0] * settings.renderWidth]
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

  let colX = settings.xPlace 
  let colY = settings.yPlace + Math.ceil(rDims[1] / 10) * 10 + 10

  // build a reporting block, 
  let messageBox = new TextBlock({
    xPlace: colX,
    yPlace: colY,
    width: settings.renderWidth,
    height: 30,
    defaultText: `...`
  }, true)
  
  // and a mill-traces box,
  let tracesBtn = new Button({
    xPlace: colX, 
    yPlace: colY += 50, 
    width: 200, 
    height: 30, 
    defaultText: `mill traces`
  })

  let outlineBtn = new Button({
    xPlace: colX,
    yPlace: colY += 40, 
    width: 200, 
    height: 30, 
    defaultText: `mill outline`
  })

  // -------------------------------------------- Ingest Layers 
  // we keep a stack of layers... in a job object, 
  let job = {
    position: [0, 0],
    layers: [],
    elem: $('<div>')
      .attr('id', 'jobtainer')
      .css('position', 'absolute')  // it's abs-position 
      .css('transform-origin', 'top left')  // scale from top left,
      .css('left', `0px`)
      .css('top', `0px`)
      .get(0)
  }
  $(this.elem).append(job.elem)
  /* layers are like... 
  { 
    name: <layerName: top, bottom, or outline>, 
    imageData: <ImageData>,   // this has .width and .height, then with DPI we have size 
    dpi: <num = 1000> 
  }
  */
  this.addLayer = async (layer) => {
    try {
      console.warn(layer)
      // we'll want a scale which is relative our rendering size... 
      // imageData is pixels-across, 
      let realX = layer.imageData.width / layer.dpi * 25.4
      console.log(`real width is ${realX}, machine width ${mDims[0]}`)
      let renderX = (realX / mDims[0]) * rDims[0]
      console.log(`render width should be ${renderX}`)
      let scale = renderX / layer.imageData.width
      // and we have a machine
      console.log(`scale at ${scale} would set width to ${layer.imageData.width * scale}`)
      // we make a canvas that's appropriately sized for our "machine bed"
      // ... we'll use the original ImageData for paths anyways, this is messed up, we make a 
      // virtual canvas to fit the OG perfectly:
      let virtualCanvas = document.createElement('canvas')
      virtualCanvas.width = layer.imageData.width
      virtualCanvas.height = layer.imageData.height
      // we load our imageData there, 
      virtualCanvas.getContext('2d').putImageData(layer.imageData, 0, 0) 
      // now we make another, which is scaled as we'd like, 
      let canvas = document.createElement('canvas')
      canvas.width = layer.imageData.width * scale
      canvas.height = layer.imageData.height * scale
      // now we draw from one to the other, 
      let context = canvas.getContext('2d')
      context.drawImage(virtualCanvas, 0, 0, canvas.width, canvas.height)
      // append that... 
      $(job.elem).append(canvas)
      job.layers.push(layer)
    } catch (err) {
      console.error(err)
    }
  }

  // let's move that around on mouse drags,
  this.elem.addEventListener('mousedown', (evt) => {
    evt.preventDefault()
    evt.stopPropagation()
    this.elem.removeEventListener('mousemove', reportMousePosn)
    dt.dragTool((drag) => {
      drag.preventDefault()
      drag.stopPropagation()
      let ct = dt.readTransform(job.elem)
      ct.x += drag.movementX
      ct.y += drag.movementY
      dt.writeTransform(job.elem, ct)
    }, (up) => {
      this.elem.addEventListener('mousemove', reportMousePosn)
    })
  })

  let reportMousePosn = (evt) => {
    if (evt.target != this.elem) return
    messageBox.setText(`mx: ${(evt.layerX * renderToMachineScale).toFixed(2)}\tmy: ${((rDims[1] - evt.layerY) * renderToMachineScale).toFixed(2)}`)// px: ${evt.layerX}\tpy: ${evt.layerY}`)
  }

  this.elem.addEventListener('mousemove', reportMousePosn)

  // let's add the button fns, 
  tracesBtn.onClick(async () => {
    try {
      tracesBtn.yellow(`calculating path...`)
      // should be layers.topTraces 
      let path = await ImgToPath2D({
        imageData: job.layers[0].imageData,
        realWidth: job.layers[0].imageData.width / job.layers[0].dpi * 25.4,
        toolOffset: 1/64 * 0.5 * 25.4,  
        zUp: 2,
        zDown: -0.1,
        passDepth: 0.1,
        feedRate: 20,
        jogRate: 100, 
      })
      tracesBtn.yellow(`offsetting path...`)
      for(let move of path){
        move.target[0] += job.position[0]
        move.target[1] += job.position[1]
      }
      // now ingest to machine... 
      for(let m in path){
        tracesBtn.yellow(`sending ${m} / ${path.length-1}`)
        await machine.addMoveToQueue(path[m])
      }
      tracesBtn.green(`done`)
    } catch (err) {
      tracesBtn.red(`error, see console...`)
      console.error(err)
    }
  })

}