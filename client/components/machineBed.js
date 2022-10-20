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

import TIME from '../../core/time.js'

import { Button, TextBlock } from '../interface/basics.js'
import dt from '../interface/domTools.js'
import gerberConverter from './gerberConverter.js'
import ImgToPath2D from './img2path.js'

// this is apparently... a constant? in graphics? tf?
let mmToPixel = 3 / 0.79375
let pixelToMM = 1 / mmToPixel

export default function MachineBed(settings, machine, spindle) {
  // -------------------------------------------- Build the Pad... 
  // stash machine, render sizes, 
  let mDims = [machine.settings.bounds[0], machine.settings.bounds[1]]
  let rDims = [settings.renderWidth, mDims[1] / mDims[0] * settings.renderWidth]
  this.getRenderDims = () => {
    return JSON.parse(JSON.stringify(rDims))
  }
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

  // -------------------------------------------- Drag 'n Drop 

  $(this.elem).on('dragover', (evt) => {
    // console.log('dragover', evt)
    evt.preventDefault()
  })

  $(this.elem).on('drop', (evt) => {
    // walk over jquery's bottle 
    evt = evt.originalEvent
    evt.preventDefault()
    // rm our old layers... eventually we could check-guard against rm'ing stateful things here, 
    // for (let layer of layers) {
    //   layer.btn.remove()
    //   layer.remove()
    // }
    // get for-items... 
    if (evt.dataTransfer.items) {
      [...evt.dataTransfer.items].forEach((item, i) => {
        if (item.kind === 'file') {
          // ~ to use the File API 
          let file = item.getAsFile()
          console.log(`… file[${i}].name = ${file.name}`)
          // filter for names... 
          let layerName = ''
          if (file.name.includes('trace') || file.name.includes('copper_top')) {
            layerName = 'topTraces'
          } else if (file.name.includes('interior') || file.name.includes('profile')) {
            layerName = 'outline'
          } else {
            console.error(`no known layer type for ${file.name}, bailing...`)
          }
          // ok, now switch-import on types, 
          if (file.name.includes('.gbr')) {
            throw new Error('need to rework')
            // this should convert the layer to PNG, 
          } else if (file.name.includes('.png')) {
            // use a fileReaderto get the data, 
            // this could be a ute... 
            let reader = new FileReader()
            reader.addEventListener('load', () => {
              // console.log(reader.result)
              // we want to collect an ImageData from this thing, 
              let image = new Image()
              image.onload = () => {
                console.log(image)
                let canvas = document.createElement('canvas')
                canvas.width = image.width
                canvas.height = image.height
                let context = canvas.getContext('2d')
                context.drawImage(image, 0, 0, image.width, image.height)
                let imageData = context.getImageData(0, 0, image.width, image.height)
                console.log(imageData)
                this.addLayer({
                  name: layerName,
                  imageData: imageData,
                  dpi: 1000,
                })
              } // end image onload 
              image.onerror = (err) => {
                console.error(err)
              }
              image.src = reader.result
            })
            reader.addEventListener('error', (err) => {
              console.error(err)
            })
            reader.readAsDataURL(file)
          } else { // end .png case 
            console.error(`unknown file type encountered ${file.name}`)
          }
        }
      })
    } else {
      console.error(`jake hasn't handled this case...`)
      // see https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop 
    }
  })

  // -------------------------------------------- Ingest Layers 
  // we keep a stack of layers... in a job object, 
  let job = {
    position: [0, 0],
    layers: {},
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
      // now we make another, which is scaled as we'd like, this what we'll actually render, 
      let canvas = document.createElement('canvas')
      $(canvas).css('position', 'absolute')
      canvas.width = layer.imageData.width * scale
      canvas.height = layer.imageData.height * scale
      // now we draw from one to the other, 
      let context = canvas.getContext('2d')
      // top layer should render at 50% opacity, 
      if (layer.name == 'topTraces') context.globalAlpha = 0.25
      context.drawImage(virtualCanvas, 0, 0, canvas.width, canvas.height)
      // append that... 
      layer.elem = canvas
      $(job.elem).append(layer.elem)
      job.layers[layer.name] = layer
      // if that was the bottom layer and the top already exists...
      if (layer.name == 'outline' && job.layers.topTraces) {
        console.warn(`rearranging layers... sending outline to back`)
        // rm both... 
        $(job.layers.outline.elem).remove()
        $(job.layers.topTraces.elem).remove()
        // add back in,
        $(job.elem).append(job.layers.outline.elem)
        $(job.elem).append(job.layers.topTraces.elem)
      }
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
      // add this back in, 
      this.elem.addEventListener('mousemove', reportMousePosn)
      if (!job.layers.outline || !job.layers.topTraces) return
      // update the job position, given new pad position... 
      let ct = dt.readTransform(job.elem)
      let mx = ct.x * renderToMachineScale
      let my = (rDims[1] - ct.y - job.layers.outline.elem.height) * renderToMachineScale
      // console.log(`mx, my,`, mx, my)
      if (job.position[0] == mx && job.position[1] == my) {
        console.warn(`would've doubled..`)
      } else {
        job.position[0] = mx
        job.position[1] = my
        console.warn(`job to ${mx}, ${my}`)
        if (machine.available) {
          machine.getPosition().then((pos) => {
            return machine.gotoPosition([mx, my, pos[2]])
          }).then(() => {
            console.log(`on job drag, moved machine to ${mx.toFixed(2)}, ${my.toFixed(2)}`)
            // ok, 
          }).catch((err) => {
            console.error(err)
          })
        }
      }
    })
  })

  let reportMousePosn = (evt) => {
    if (evt.target != this.elem) return
    messageBox.setText(`mx: ${(evt.layerX * renderToMachineScale).toFixed(2)}\tmy: ${((rDims[1] - evt.layerY) * renderToMachineScale).toFixed(2)}`)// px: ${evt.layerX}\tpy: ${evt.layerY}`)
  }

  this.elem.addEventListener('mousemove', reportMousePosn)

  // -------------------------------------------- Bed Click Events

  this.elem.addEventListener('click', async (evt) => {
    if (evt.target != this.elem) return
    // console.log('xy...', evt.layerX * renderToMachineScale, evt.layerY * renderToMachineScale)
    try {
      if (machine.available) {
        let mx = evt.layerX * renderToMachineScale
        let my = (rDims[1] - evt.layerY) * renderToMachineScale
        // console.warn(`GOTO ${mx}, ${my} ...`)
        let pos = await machine.getPosition()
        await machine.gotoPosition([mx, my, pos[2]])
        pos = await machine.getPosition()
        // console.log(`went to ${mx.toFixed(2)}, ${my.toFixed(2)}`)
        // console.log(`retrieved ${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}`)
      }
    } catch (err) {
      console.error(err)
    }
  })

  // -------------------------------------------- Machine Posn Update Events

  machine.onSegmentComplete = (pos) => {
    // rm old dots, draw new dots ?
    $(this.elem).children('#ptagID').remove()
    $(this.elem).append(dt.svgLine(
      pos[0] * machineToRenderScale, // ax
      rDims[1] - pos[1] * machineToRenderScale, // ay
      10, // dx 
      10, // dy 
      1, // stroke 
      'ptagID'
    ))
  }

  // -------------------------------------------- Genny & Mill Buttons 

  let genTracesBtn = new Button({
    xPlace: colX,
    yPlace: colY += 50,
    width: 200,
    height: 30,
    defaultText: `generate traces plan`
  })

  let runTracesBtn = new Button({
    xPlace: colX + 210,
    yPlace: colY,
    width: 200,
    height: 30,
    defaultText: 'run traces plan'
  })

  let genOutlineBtn = new Button({
    xPlace: colX,
    yPlace: colY += 40,
    width: 200,
    height: 30,
    defaultText: `generate outline plan`
  })

  let runOutlineBtn = new Button({
    xPlace: colX + 210,
    yPlace: colY,
    width: 200,
    height: 30,
    defaultText: 'run outline plan'
  })

  // let's add the button fns, 
  genTracesBtn.onClick(async () => {
    try {
      if (!job.layers.outline) {
        genTracesBtn.yellow(`please add files first...`)
        setTimeout(() => {
          genTracesBtn.resetText()
          genTracesBtn.grey()
        }, 1000)
        return
      }
      genTracesBtn.yellow(`calculating path...`)
      let path = await ImgToPath2D({
        imageData: job.layers.topTraces.imageData,
        realWidth: job.layers.topTraces.imageData.width / job.layers.topTraces.dpi * 25.4,
        toolOffset: (1 / 64) * 0.5 * 25.4,
        zUp: 1.5,
        zDown: -0.1,
        passDepth: 0.1,
        feedRate: 4,
        jogRate: 50,
      })
      genTracesBtn.green(`traces gennie'd`)
      job.layers.topTraces.path = path
    } catch (err) {
      genTracesBtn.red(`error, see console...`)
      console.error(err)
    }
  })

  // let's add the button fns, 
  genOutlineBtn.onClick(async () => {
    try {
      if (!job.layers.outline) {
        genOutlineBtn.yellow(`please add files first...`)
        setTimeout(() => {
          genOutlineBtn.resetText()
          genOutlineBtn.grey()
        }, 1000)
        return
      }
      genOutlineBtn.yellow(`calculating path...`)
      let path = await ImgToPath2D({
        imageData: job.layers.outline.imageData,
        realWidth: job.layers.outline.imageData.width / job.layers.outline.dpi * 25.4,
        toolOffset: (1 / 32) * 0.5 * 25.4,  // in mm, 
        zUp: 2,
        zDown: -1.7,  // -1.7
        passDepth: 0.35, // 0.35
        feedRate: 6, // 6
        jogRate: 50,
      })
      genOutlineBtn.green(`outline gennie'd`)
      job.layers.outline.path = path
      for (let move of path) {
        console.log(move.target)

      }
    } catch (err) {
      genOutlineBtn.red(`error, see console...`)
      console.error(err)
    }
  })

  runTracesBtn.onClick(async () => {
    try {
      if (job.layers.topTraces && job.layers.topTraces.path) {
        // offset 'em, but **don't store the offset gd**
        let path = JSON.parse(JSON.stringify(job.layers.topTraces.path))
        for (let move of path) {
          move.target[0] += job.position[0]
          move.target[1] += job.position[1]
        }
        // spindle on, and wait for spool 
        await spindle.setDuty(0.30)
        await TIME.delay(500)
        // send each... 
        for (let p in path) {
          runTracesBtn.yellow(`sending ${p} / ${path.length - 1}`)
          await machine.addMoveToQueue(path[p])
        }
        await machine.awaitMotionEnd()
        await spindle.setDuty(0)
        await machine.park()
        runTracesBtn.green(`done`)
      } else {
        runTracesBtn.yellow(`please gen plan first... `)
        setTimeout(() => {
          runTracesBtn.resetText()
          runTracesBtn.grey()
        }, 1000)
      }
    } catch (err) {
      runTracesBtn.red(`error, see console...`)
      console.error(err)
    }
  })

  runOutlineBtn.onClick(async () => {
    try {
      if (job.layers.outline && job.layers.outline.path) {
        // offset 'em 
        let path = JSON.parse(JSON.stringify(job.layers.outline.path))
        for (let move of path) {
          move.target[0] += job.position[0]
          move.target[1] += job.position[1]
        }
        // spindle on, and wait for spool 
        await spindle.setDuty(0.30)
        await TIME.delay(500)
        // run 'em 
        for (let p in path) {
          runOutlineBtn.yellow(`sending ${p} / ${path.length - 1}`)
          // console.log(`send move... ${job.layers.outline.path[p].target[0].toFixed(2)}, ${job.layers.outline.path[p].target[1].toFixed(2)}`)
          await machine.addMoveToQueue(path[p])
        }
        await machine.awaitMotionEnd()
        await spindle.setDuty(0)
        await machine.park()
        runOutlineBtn.green(`done`)
      } else {
        runOutlineBtn.yellow(`please gen plan first... `)
        setTimeout(() => {
          runOutlineBtn.resetText()
          runOutlineBtn.grey()
        }, 1000)
      }
    } catch (err) {
      runOutlineBtn.red(`error, see console...`)
      console.error(err)
    }
  })

}