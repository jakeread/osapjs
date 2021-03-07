/*
osap-vertex.js

base vertex in osap graph 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { TIMES } from './ts.js'
import { handler } from './osap-utils.js'

export default class Vertex {
  /* to implement */
  // write this.onData(), returning promise when data is cleared out 
  // use this.transmit(bytes), 
  // use this.addRoute(route) to add routes 

  constructor(parent, indice) {
    this.parent = parent
    this.indice = indice
  }

  // local data store / freshness 
  data = new Uint8Array(0)
  token = false
  occupied = function () {
    return this.token
  }

  dest = function (data, ptr) {
    // now we have this unhandled data, 
    this.token = true
    // it's the whole packet, copied out 
    let buffer = data.slice(0)
    // we ask handler to clear, 
    this.onData(buffer, ptr).then(() => {
      // if it resolves, we are open again, and data copies in 
      this.data = buffer
      this.token = false
    }).catch((err) => {
      // otherwise we have rejected it, data doesn't change 
      // but are still open again 
      this.token = false
    })
  }

  onData = function (data, ptr) {
    console.log(`default vertex ${this.type} onData`)
    return new Promise((resolve, reject) => {
      resolve()
    })
  }

  // we keep a stack of messages... 
  stack = []
  lastHandled = 0
  handle = function (data, ptr) {
    let pck = {
      data: data.slice(0),
      ptr: ptr,
      arrivalTime: TIMES.getTimeStamp(),
      handled: () => {
        for (let i = 0; i < this.stack.length; i++) {
          if (this.stack[i] == pck) {
            this.stack.splice(i, 1) // rm this element 
          }
        }
      }
    }
    this.stack.push(pck)
    this.startLoop()
  }

  // we have a kind of runtime, 
  loopTimer = null
  // avoid having multiple timer events for this, 
  startLoop = function () {
    // another caveat of 'class' in js: wrap class-based fn in 
    // anonymous fn for execution in timeout (which executes at window level)
    // note: if we run this.loop() right away, and the path is clear, 
    // all will shoot through in a single turn of the loop...
    // I think this is a greedy approach, but it improves performance ~ 2 orders magnitude
    // for system escape (endpoint -> vport -> exit) (5ms -> 0.05ms)
    if (!this.loopTimer) this.loop() //this.loopTimer = setTimeout(() => { this.loop() }, 0) //this.loop()
  }

  loop = function () {
    // pull packets on round-robin, 
    this.lastHandled++
    if (this.lastHandled > this.stack.length - 1) {
      this.lastHandled = 0
    }
    let pck = this.stack[this.lastHandled]
    // handle them, 
    if (pck) handler(this, pck, pck.ptr)
    // if not all cleared, do this again next js event loop 
    if (this.stack.length != 0) {
      this.loopTimer = setTimeout(() => { this.loop() }, 0)
    } else {
      clearTimeout(this.loopTimer)
      this.loopTimer = null
    }
  }
}