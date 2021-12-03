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

import DT from '../interface/domTools.js'
import { Button, TextBlock, TextInput } from '../interface/basics.js'

function GCodePanel(xPlace, yPlace, width, machine, hotend) {
  // some hack padding correction 
  width -= 3
  // text box for elements that have been handled, 
  // previous gcodes thru 
  let previously = $('<textarea>').addClass('inputwrap')
    .attr('wrap', 'off')
    .attr('readonly', 'true')
    .get(0)
  DT.placeField(previously, width, 207, xPlace, yPlace)
  // to load files, 
  let loadBtn = $('<input type = "file">')
    .on('change', (evt) => {
      let reader = new FileReader()
      reader.onload = () => {
        let text = reader.result
        console.log(`loaded file with len ${text.length}`)
        gCodeIncoming = text
      }
      reader.readAsText(evt.target.files[0])
      console.log('load', evt.target.files[0])
    })
    .get(0)
  // load 
  DT.placeField(loadBtn, width, 20, xPlace, yPlace += 220)
  // run / pause ... >, ||, 
  let runBtn = new Button(xPlace, yPlace += 30, 54, 14, '>')
  runBtn.onClick(() => {
    if (running) {
      this.pause()
    } else {
      this.start()
    }
  })
  // one line, >|
  //  let onceBtn = new Button(xPlace + 60, yPlace, 44, 14, '>|')
  // some status display:
  let status = new TextBlock(xPlace, yPlace += 30, width - 3, 24, 'paused')
  // incoming gcodes 
  let incoming = $('<textarea>').addClass('inputwrap')
    .attr('wrap', 'off')
    .get(0)
  DT.placeField(incoming, width, 460, xPlace, yPlace += 30 + 10)

  // load files w/ 
  this.loadServerFile = (path) => {
    this.pause()
    return new Promise((resolve, reject) => {
      getServerFile(path).then((res) => {
        this.loadString(res)
        resolve()
      }).catch((err) => {
        reject(err)
      })
    })
  }

  // load w/ string:
  let gCodeIncoming = ""
  this.loadString = (str) => {
    this.pause()
    incoming.value = str
    gCodeIncoming = str 
  }

  // running, or not: some state:
  let running = false

  // we should have a basic API, like:
  this.pause = () => {
    running = false
    runBtn.grey(">")
    status.grey('paused')
  }

  // begins the loop, should resolve or throw error so long as thing is running ? 
  this.start = async () => {
    running = true
    runBtn.green("||")
    status.green('starting')
    while(running){
      try {
        let completedLine = await feedNext()
        if(completedLine == "EOF"){
          console.log("END, awaitin no motion...")
          await machine.motion.awaitMotionEnd()
          running = false 
        } else {
          //console.log(`done: ${completedLine}`)
        }
      } catch (err) {
        console.error(err)
        this.pause()
        throw err
      }
    }
  }

  // feeds one line, resolves when line is complete: 
  let feedNext = () => {
    return new Promise((resolve, reject) => {
      // parse substring of file on next newline, 
      let eol = gCodeIncoming.indexOf('\n') + 1
      // if end of file & no new-line terminating, 
      if (eol == 0) eol = gCodeIncoming.length
      // get the new thing, 
      let line = gCodeIncoming.substring(0, eol)
      // should check if is end of file 
      if (gCodeIncoming.length == 0) {
        resolve("EOF")
        return
      }
      // otherwise parse 
      parse(line).then(() => {
        // success, clear and add to prev 
        //previously.value += line
        //previously.scrollTop = previously.scrollHeight
        //console.log('completed', line)
        resolve(line)
      }).catch((err) => {
        // failure, backup 
        console.error(`error feeding gcode '${line}'`, err)
        status.red()
        status.setHTML(`error feeding line, see console:<br>${line}`)
        gCodeIncoming = line.concat(gCodeIncoming)
        reject()
      })
      gCodeIncoming = gCodeIncoming.substring(eol)
    })
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
  let feedConvert = 1 / 60 // to swap units/s and units/inch ... 
  // here we go: 
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
        feedConvert = 25.4 / 60   // mm/min to mm/sec 
        break;
      case 'G21':
        posConvert = 1
        feedConvert = 1 / 60      // at gcode interface we swap mm/min to mm/sec
        break;
      case 'G00':
      case 'G0':
        feedMode = 'G00'
        let g0move = gMove(words)
        status.setText(line)
        // some of these *just* set feedrate, 
        if (g0move.rateOnly) return
        await machine.motion.addMoveToQueue(g0move)
        break;
      case 'G01':
      case 'G1':
        feedMode = 'G01'
        let g1move = gMove(words)
        status.setText(line)
        if (g1move.rateOnly) return
        await machine.motion.addMoveToQueue(g1move)
        break;
      case 'G28':
        console.warn('ignoring G28 home')
        break;
      case 'G80':
        console.warn('ignoring G80 mesh bed levelling')
        break;
      case 'G90':
        // 'use absolute coordinates'
        console.warn('ignoring G90 use absolute coordinates')
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
        // HERE
        console.log('would await end, then set rpm', rpm)
        //await vm.motion.awaitMotionEnd()
        //await this.spindleOut.send(rpm)
        break;
      case 'M05':
        // HERE 
        console.log('would await end, then set rpm 0')
        //await this.awaitMotionEnd.send()
        //await this.spindleOut.send(0)
        break;
      case 'M83':
        // use relative extruder mode,
        console.warn('ignoring M83 use rel extrude')
        break;
      case 'M104': {
        // set extruder temp,
        let temp = parseFloat(words[1].substring(1))
        console.log('would set extruder temp', temp)
        //await this.extruderTempOut.send(temp)
        break;
      }
      case 'M106': {
        // set fan speed 
        let speed = parseFloat(words[1].substring(1)) / 255
        await hotend.setPCF(speed)
        console.log('set fan speed', speed)
        break;
      }
      case 'M140': {
        // set bed temp,
        let temp = parseFloat(words[1].substring(1))
        // HERE
        console.log('would await bed temp', temp)
        //await this.bedTempOut.send(temp)
        break;
      }
      case 'M109': {
        // await extruder temp, 
        let temp = parseFloat(words[1].substring(1))
        // HERE 
        console.log('would await extruder temp', temp)
        //await this.awaitExtruderTemp.send(temp)
        break;
      }
      case 'M190': {
        // await bed temp 
        let temp = parseFloat(words[1].substring(1))
        // HERE 
        console.log('would await bed temp', temp)
        //await this.awaitBedTemp.send(temp)
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
        break;
    } // end first word switch     
  } // end parse 

  let gMove = (words) => {
    // to check for E-alone moves, 
    let includesE, includesX, includesY, includesZ, includesF = false;
    for (let word of words) {
      if (word.includes('E')) includesE = true;
      if (word.includes('X')) includesX = true;
      if (word.includes('Y')) includesY = true;
      if (word.includes('Z')) includesZ = true;
      if (word.includes('F')) includesF = true;
    }
    if (includesE && (!includesX && !includesY && !includesZ)) {
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
    if (includesF && !includesX && !includesY && !includesZ && !includesE) {
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
let getServerFile = (file) => {
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