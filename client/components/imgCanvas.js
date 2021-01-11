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

import dt from '../drawing/domtools.js'

export default function ImgCanvas(xPlace, yPlace, width, height) {
    // machine size : pixel size
    let psize = [width, height]
    let msize = [10, 10]
    let scale = [msize[0] / psize[0], msize[1] / psize[1]]
    // setup the pad
    let dom = $('.plane').get(0)
    let pad = $('<div>').addClass('pad').get(0)
    $(pad).css('background-color', '#ffe').css('width', `${psize[0]}px`).css('height', `${psize[1]}px`)
    $(dom).append(pad)
    let dft = { s: 1, x: xPlace, y: yPlace, ox: 0, oy: 0 }
    dt.writeTransform(pad, dft)
    // canvas
    let canvas = document.createElement('canvas')
    $(pad).append(canvas)
    console.log(pad)

    this.draw = (imgdata) => {
        console.log('drawing to canvas', imgdata)
        // assert 100p alpha channel 
        for (let i = 0; i < imgdata.data.length; i += 4) {
            //imgdata.data[i] = 255;
            imgdata.data[i + 3] = 255;
        }
        // these are weird,first we put imgdata into a 'virtual' canvas that we won't render 
        let vcanvas = document.createElement('canvas')
        vcanvas.width = imgdata.width
        vcanvas.height = imgdata.height
        vcanvas.getContext('2d').putImageData(imgdata, 0, 0)
        // now we want to render at a fixed size: we pick our width and scale height to match 
        let scale = width / imgdata.width
        canvas.height = imgdata.height * scale
        canvas.width = imgdata.width * scale // yes this should just re-assert that width = width 
        $(pad).css('height', `${canvas.height}px`)
        console.log(`scale to render by ${scale}`)
        // now we scale the rendering context 
        canvas.getContext('2d').scale(scale, scale)
        // and draw into it, not imagdata, but the 'image' from the canvas... idk, 
        canvas.getContext('2d').drawImage(vcanvas, 0, 0)
    }
}