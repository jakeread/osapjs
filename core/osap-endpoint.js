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

import { PK, TS, TIMES } from './ts.js'
import { ptrLoop, handler } from './osap-utils.js'

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
  this.type = "endpoint"

  // parent checks 
  this.clear = () => {
    return !this.token
  }

  this.onData = (pck, ptr) => {
    console.log("endpoint onData")
  }

  // handler is functional / contextual, 
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
      let datagram = new Uint8Array(route.path.length + this.data.length)
      datagram.set(route.path, 0)
      datagram.set(this.data, route.path.length)
      let pck = {
        data: datagram,
        origin: this,
        arrivalTime: TIMES.getTimeStamp(),
        handled: function () {
          console.log("HANDLED from Endpoint Transmit origin")
        }
      }
      this.handle(pck, 0)
    }

  }
}