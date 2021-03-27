/*
gCodePanel.js

input gcodes 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

/*
notes on this thing

this is pretty straightforward at the moment, it'll read small gcodes
i.e. those used to mill circuits. for larger files, like 3DP files,
reading times / manipulating large streams of texts needs to be handled 
more intelligently, i.e. not rendering the whole file into the 'incoming' body. 

*/

'use strict'

import { Output, Input } from '../../core/modules.js'
import DT from '../interface/domTools.js'
import { Button } from '../interface/button.js'

function GCodePanel(xPlace, yPlace) {
  // home dom
  let dom = $('.plane').get(0)

  // previously, in, incoming, etc 
  let domx = xPlace
  let domwidth = 220
  let yspace = 10
  let yplace = yPlace
  // previous gcodes thru 
  let previously = $('<textarea>').addClass('inputwrap')
    .attr('wrap', 'off')
    .attr('readonly', 'true')
    .get(0)
  DT.placeField(previously, domwidth, 200, domx, yplace)
  // optional manual type/feed 
  let lineIn = $('<input>').addClass('inputwrap')
    .get(0)
  DT.placeField(lineIn, domwidth, 20, domx, yplace += 200 + yspace)
  // run / stop 
  let runStop = $('<div>').addClass('button')
    .text('run')
    .get(0)
  DT.placeField(runStop, 44, 14, domx, yplace += 20 + yspace) // 3px padding
  // one line 
  let once = $('<div>').addClass('button')
    .text('once')
    .get(0)
  DT.placeField(once, 44, 14, domx + 60, yplace)
  // load 
  let load = $('<input type = "file">')
    .on('change', (evt) => {
      let reader = new FileReader()
      reader.onload = () => {
        let text = reader.result
        console.log(`loaded file with len ${text.length}`)
        incoming.value = text
      }
      reader.readAsText(evt.target.files[0])
      console.log('load', evt.target.files[0])
    })
    .get(0)
  DT.placeField(load, 94, 20, domx + 120, yplace)
  // incoming gcodes 
  let incoming = $('<textarea>').addClass('inputwrap')
    .attr('wrap', 'off')
    .get(0)
  DT.placeField(incoming, domwidth, 460, domx, yplace += 20 + yspace)

  // startup with, 
  // 'save/pcbmill-stepper.gcode' 114kb
  // 'save/3dp-zdrive-left.gcode' 15940kb (too big for current setup)
  // 'save/clank-lz-bed-face.gcode'
  // 'save/3dp-10mmbox.gcode'
  initWith('save/3dp-extruder-test.gcode').then((res) => {
    incoming.value = res
  }).catch((err) => {
    console.error(err)
  })

  // for this runtime, we need a port to throw moves onto, 
  // that should have similar properties to old CF things:
  // ... 
  // I also need to determine a type for that, maybe I want typescript in here. 
  // first, I need to think up what kinds of things I'm going to be sending to saturn 
  // setup has 'axis order', to pick X, Y, Z, etc, that's a string / csv list 
  // move: {pos: [], rate: <num>} units/s ... that it? saturn is responsible for accel vals etc 

  this.moveOut = new Output()
  this.spindleOut = new Output()
  this.awaitMotionEnd = new Output()
  this.extruderTempOut = new Output()
  this.awaitExtruderTemp = new Output()
  this.bedTempOut = new Output()
  this.awaitBedTemp = new Output() 

  // thru-feed: pull from incoming, await, push to previous 
  let thruFeed = () => {
    return new Promise((resolve, reject) => {
      let eol = incoming.value.indexOf('\n') + 1
      // if end of file & no new-line terminating, 
      if (eol == 0) eol = incoming.value.length
      let line = incoming.value.substring(0, eol)
      lineIn.value = line
      // should check if is end of file 
      if (incoming.value.length == 0) {
        resolve(true)
        return
      }
      // otherwise parse 
      parse(line).then(() => {
        // success, clear and add to prev 
        lineIn.value = ''
        previously.value += line
        previously.scrollTop = previously.scrollHeight
        resolve(false)
        //resolve()
      }).catch((err) => {
        // failure, backup 
        console.error('err feeding', line, err)
        lineIn.value = ''
        incoming.value = line.concat(incoming.value)
        reject()
      })
      incoming.value = incoming.value.substring(eol)
    })
  }
  // one line increment... ad 'hold' flag when awaiting ? 
  // could match globally: whenever awaiting processing... set red 
  $(once).on('click', (evt) => {
    thruFeed().then(() => {
      //console.log('thru')
    }).catch((err) => {
      console.error(err)
    })
  })
  // then we need loops... 
  let running = false
  $(runStop).on('click', (evt) => {
    if (running) {
      running = false
      $(runStop).text('run')
    } else {
      running = true
      $(runStop).text('stop')
      run()
    }
  })
  // the loop, 
  let run = async () => {
    while (running) {
      try {
        let complete = await thruFeed()
        if (complete) {
          running = false
          $(runStop).text('run')
        } else {
          // inserts a break in js event system, important 
          await new Promise((resolve, reject) => {
            setTimeout(resolve, 0)
          })
        }
      } catch (err) {
        console.error(err)
        running = false
      }
    }
  }

  // the actual gcode parsing, 
  let axesString = "X, Y, Z, E" 
  let axes = pullAxes(axesString)
  let position = {}
  for (let axis of axes) {
    position[axis] = 0.0
  }
  let feedRates = { // in mm/min: defaults if not set 
    G00: 600, // rapids
    G01: 60 // feeds 
  }
  let feedMode = 'G01'
  let posConvert = 1 // to swap mm / inches if G20 or G21 
  let feedConvert = 1 // to swap units/s and units/inch ... 
  let parse = async (line) => {
    if (line.length == 0) {
      return
    }
    let move = false
    let words = stripComments(line).match(re) || []
    if (words.length < 1) return
    // single feed: sets all feedrates 
    if (words[0].includes('F')) {
      let feed = parseFloat(words[0].substring(1))
      if (Number.isNaN(feed)) {
        console.error('NaN for GCode Parse Feed')
      } else {
        for (let f in feedRates) {
          feedRates[f] = feed
        }
      }
      return
    } // end lonely F     
    // do normal pickings 
    switch (words[0]) {
      case 'G20':
        posConvert = 25.4
        feedConvert = 25.4
        return
      case 'G21':
        posConvert = 1
        feedConvert = 1
        return
      case 'G00':
      case 'G0':
        feedMode = 'G00'
        let g0move = gMove(words)
        // some of these *just* set feedrate, 
        if(g0move.rateOnly) return 
        await this.moveOut.send(g0move)
        return
      case 'G01':
      case 'G1':
        feedMode = 'G01'
        let g1move = gMove(words)
        if(g1move.rateOnly) return 
        await this.moveOut.send(g1move)
        return
      case 'G28':
        console.warn('ignoring G28 home')
        break;
      case 'G80':
        console.warn('ignoring G80 mesh bed levelling')
        break;
      case 'G90':
        // 'use absolute coordinates'
        console.warn('ignoring G90')
        break;
      case 'G92':
        console.warn('ignoring G92 set pos')
        break;
      case 'M03':
        let rpm = words[1].substring(1)
        if (Number.isNaN(rpm)) {
          rpm = 0
          console.error('bad RPM parse')
        }
        await this.awaitMotionEnd.send()
        await this.spindleOut.send(rpm)
        break;
      case 'M05':
        await this.awaitMotionEnd.send()
        await this.spindleOut.send(0)
        break;
      case 'M83':
        // use relative extruder mode,
        console.warn('ignoring M83 use rel extrude')
        break;
      case 'M104': {
        // set extruder temp,
        let temp = parseFloat(words[1].substring(1))
        await this.extruderTempOut.send(temp)
        break;
      }
      case 'M140': {
        // set bed temp,
        let temp = parseFloat(words[1].substring(1))
        await this.bedTempOut.send(temp)
        break;
      }
      case 'M109':{
        // await extruder temp, 
        let temp = parseFloat(words[1].substring(1))
        await this.awaitExtruderTemp.send(temp)
        break;
      }
      case 'M190':{
        // await bed temp 
        let temp = parseFloat(words[1].substring(1))
        await this.awaitBedTemp.send(temp)
        break;
      }
      case 'M201':
      // these codes set max accelerations... 
      case 'M203':
      // these set maximum rates 
      case 'M204':
      // set printing (P arg) and traversing (T arg) accelerations
      case 'M205':
      // set jerk rates 
      case 'M107':
      // sets the print fan off, 
      case 'M221':
      // sets extruder override percentage 
      case 'M900':
      // sets extrusion pressure lookahead parameters... 
      default:
        console.warn('ignoring GCode', line)
        return
    } // end first word switch     
  } // end parse 

  let gMove = (words) => {
    // to check for E-alone moves, 
    let includesE, includesX, includesY, includesZ, includesF = false;
    for(let word of words){
      if(word.includes('E')) includesE = true;
      if(word.includes('X')) includesX = true;
      if(word.includes('Y')) includesY = true;
      if(word.includes('Z')) includesZ = true;
      if(word.includes('F')) includesF = true;
    }
    if(includesE && (!includesX && !includesY && !includesZ)){
      // turns out, this works OK... 
      console.warn('E-Only G Code')
    }
    // always reset e-position to zero, 
    // this one isn't stateful, is incremental: 
    position.E = 0 
    // now load in posns, 
    for (let word of words) {
      for (let axis of axes) {
        if (word.includes(axis)) {
          let pos = parseFloat(word.substring(1))
          if (Number.isNaN(pos)) {
            console.error('NaN for GCode Parse Position')
          } else {
            position[axis] = pos
          }
        }
      } // end check axis in word, 
      if (word.includes('F')) {
        let feed = parseFloat(word.substring(1))
        if (Number.isNaN(feed)) {
          console.error('NaN for GCode Parse Feed')
        } else {
          feedRates[feedMode] = feed
        }
      }
    } // end for-words 
    // output the move, 
    let move = { position: {}, rate: feedRates[feedMode] * feedConvert }
    for (let axis of axes) {
      move.position[axis] = position[axis] * posConvert
    }
    // or, // check for rate-only move, 
    if (includesF && !includesX && !includesY && !includesZ && !includesE){
      console.warn('F-Only G Code')
      move.rateOnly = true 
    } else {
      move.rateOnly = false 
    }
    return move
  }
}

// reference:
// spy from https://github.com/cncjs/gcode-parser/blob/master/src/index.js thx 
/*
G00:        move at rapids speed 
G01:        move at last G01 F<num>
G04 P<num>:  dwell for P milliseconds or X seconds 
G20:        set coordinates to inches 
G21:        set coordinates to mm 
G28:        do homing routine 
G90:        positions are absolute w/r/t zero 
G91:        positions are incremenetal w/r/t last moves 
G94:        feedrates are per minute 
*/
/*
F<num>:     set feedrate for modal G 
M03 S<num>: set clockwise rotation 
M04 S<num>: set counter-clockwise rotation 
M05:        stop spindle 
M83:        use extruder relative motion 
*/

export { GCodePanel }

// lifted from https://github.com/cncjs/gcode-parser/blob/master/src/index.js
const stripComments = (() => {
  const re1 = new RegExp(/\s*\([^\)]*\)/g); // Remove anything inside the parentheses
  const re2 = new RegExp(/\s*;.*/g); // Remove anything after a semi-colon to the end of the line, including preceding spaces
  const re3 = new RegExp(/\s+/g);
  return (line => line.replace(re1, '').replace(re2, '').replace(re3, ''));
})()
const re = /(%.*)|({.*)|((?:\$\$)|(?:\$[a-zA-Z0-9#]*))|([a-zA-Z][0-9\+\-\.]+)|(\*[0-9]+)/igm

let pullAxes = (str) => {
  const whiteSpace = new RegExp(/\s*/g)
  str = str.replace(whiteSpace, '')
  return str.split(',')
}

// startup with demo gcode, for testing 
let initWith = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject('no startup file, ok')
      return
    }
    $.ajax({
      type: "GET",
      url: file,
      error: function () { reject(`req for ${file} fails`) },
      success: function (xhr, statusText) {
        resolve(xhr)
      }
    })
  })
}