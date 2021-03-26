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
import Vertex from './osapVertex.js'

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
  type = VT.ENDPOINT
  name = "unnamed endpoint"

  // and has a local data cache 
  data = new Uint8Array(0)

  // has outgoing routes, 
  addRoute = function (route) {
    console.log('adding route', route)
    if (this.maxStackLength <= this.routes.length) {
      console.warn('increasing stack space to match count of routes')
      this.maxStackLength++
    }
    this.routes.push(route)
  }

  // transmit to all routes & await return before resolving, 
  write = function (data) {
    // keep the cache
    this.data = data
    return new Promise((resolve, reject) => {
      // want to write one per route, 
      // but need room in the stack for each route... 
      if (this.maxStackLength - this.stack[VT.STACK_ORIGIN].length < this.routes.length) {
        reject('write to full stack')
        return
      }
      // else, carry on 
      for (let route of this.routes) {
        // we want to push elements into the stack, 
        let datagram = new Uint8Array(route.length + this.data.length)
        datagram.set(route, 0)
        datagram.set(this.data, route.length)
        // this is the universal vertex data uptake, '0' for origin stack, 
        this.handle(datagram, 0)
      }
      // and we can check... when the stack will be clear to write again, 
      let resolved = false 
      let rejected = false 
      let check = () => {
        if (this.maxStackLength - this.stack[VT.STACK_ORIGIN].length >= this.routes.length) {
          resolved = true 
          if(!rejected) resolve()
        } else {
          setTimeout(check, 0) // check next cycle, 
        }
      }
      check()
      // set a timeout, 
      setTimeout(() => {
        rejected = true 
        if(!resolved) reject('timeout')
      }, TIMES.staleTimeout)
    })
  } // end write 

}