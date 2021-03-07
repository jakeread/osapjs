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

import { PK, TS, VT, TIMES } from './ts.js'
import { ptrLoop, handler, reverseRoute } from './osap-utils.js'
import Vertex from './osap-vertex.js'

export default class Endpoint extends Vertex {
  constructor(parent, indice) {
    super(parent, indice)
  }

  /* to implement */
  // write this.onData(), returning promise when data is cleared out 
  // use this.transmit(bytes), 
  // use this.addRoute(route) to add routes 

  // endpoint addnl'y has outgoing routes, 
  routes = []
  type = VT.SOFT
  
  // has outgoing routes, 
  addRoute = function (route) {
    console.log('adding route', route)
    this.routes.push(route)
  }

  // transmit to all routes & await return before resolving, 
  write = function (datagram) {
    // can't write if stack is full, 
    if(this.stack.length > TIMES.stackSize){
      throw new Error('faulty write')
    }
    // 'write' updates the data stored here, lettuce do that first.
    // the best way to copy an array in js (source: internet) is:
    this.data = datagram.slice(0)
    // now send anything, no backpressure here yet 
    this.transmit()
    // resolve when stack < max 
    return new Promise((resolve, reject) => {
      let check = () => {
        if(this.stack.length < TIMES.stackSize){
          resolve()
        } else {
          setTimeout(check, 0)
        }
      }
      check()
    })
  }

  transmit = function () {
    // write outgoing msgs for each route, 
    for (let route of this.routes) {
      // write a datagram and push it through 
      let datagram = new Uint8Array(route.length + this.data.length)
      datagram.set(route, 0)
      datagram.set(this.data, route.length)
      // push thru on backpressure
      this.handle(datagram, 0)
    }
  }
}