/*
osap-endpoint.js

prototype software entry point / network endpoint for osap system

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, TS, OT, TIMES } from './ts.js'
import { ptrLoop, handler, reverseRoute } from './osap-utils.js'

export default function Endpoint(parent) {
  // has parent 
  this.parent = parent 
  // has local data copy 
  this.data = new Uint8Array(0)
  this.token = false // 'occupied' or not 
  // has outgoing routes, 
  this.routes = []
  // has a position (parent will set), and type 
  this.indice = undefined
  // has type, 
  this.type = OT.SOFT

  // parent checks 
  this.clear = () => {
    return !this.token
  }

  // handler for pck = us, 
  // pck[ptr] == PK.DEST 
  this.dest = (pck, ptr) => {
    // now we have this unhandled data, 
    this.token = true 
    // it's the whole packet, copied out 
    let data = pck.data.slice(0)
    // we ask handler to clear, 
    this.onData(data, ptr).then(() => {
      // if it resolves, we are open again, and data copies in 
      this.data = data 
      this.token = false 
    }).catch((err) => {
      // otherwise we have rejected it, data doesn't change 
      // but are still open again 
      this.token = false 
    })
  }

  this.onData = (data, ptr) => {
    console.log('default endpoint onData')
    return new Promise((resolve, reject) => {
      resolve()
    })
  }

  // handler is functional / contextual, 
  // it should be assumed we're clear before handle is called
  this.handle = (pck, ptr) => {
    handler(this, pck, ptr)
  }

  // ------------------------ add a route, using TS.route().[...].end(seg) 
  this.addRoute = (route) => {
    console.log(route)
    this.routes.push(route)
  }

  // transmit to all routes & await return before resolving, 
  this.write = (datagram) => {
    // 'write' updates the data stored here, lettuce do that first.
    // the best way to copy an array in js (source: internet) is:
    this.data = datagram.slice(0)
    // now send everything, then return 
    return this.transmit()
  }

  this.transmit = () => {
    // write outgoing msgs for each route, 
    for (let route of this.routes) {
      // write the gram: 1st write in departure, which is this object indice
      // that's 3 bytes for the departure, 1 for ptr, and 1 for dest key
      // ... we are flipping the 'up-obj' output code for our reciprocal return path 
      // which is the down-obj, to our indice 
      let datagram = new Uint8Array(route.length + this.data.length)
      datagram.set(route, 0)
      datagram.set(this.data, route.length)
      let pck = {
        data: datagram,
        origin: this,
        arrivalTime: TIMES.getTimeStamp(),
        state: "awaiting",
        timer: null, 
        handled: function () {
          this.state = "transmitted"
          console.log("HANDLED from Endpoint Transmit origin")
        }
      }
      let check = () => {
        switch(pck.state){
          case "awaiting":
            this.handle(pck, 0)
            break;
          case "timeout":
            clearTimeout(pck.timer)
            return;
          case "transmitted":
            clearTimeout(pck.timer)
            return;
        }
        pck.timer = setTimeout(check, 0)
      }
      setTimeout(() => {
        pck.state = "timeout"
      }, TIMES.staleTimeout)
      check()
    }

  }
}