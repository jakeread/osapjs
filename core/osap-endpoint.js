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

export default function Endpoint(osap) {
  // has local data copy 
  this.data = new Uint8Array(0)
  // has outgoing routes, 
  this.routes = []
  // has a position (osap will set)
  this.indice = undefined 
  // has a write timeout length,
  this.timeoutLength = TIMES.endpointTransmitTimeout
  this.setTimeoutLength = (millis) => {
    this.timeoutLength = millis 
  }

  // ------------------------ OSAP pushes data in here, 
  this.recieve = (datagram) => {
    throw new Error("this side not really ready in JS")
  }

  // ------------------------ endpoint API handles it here, returning a promise when it's clear... 
  this.onData = (data) => {
    return new Promise((resolve, reject) => {
      reject('onData method not attached')
    })
  }

  // ------------------------ add a route, using TS.route().[...].end(seg) 
  this.addRoute = (route) => {
    this.routes.push(route)
  }

  // transmit to all routes & await return before resolving, 
  this.write = (datagram) => {
    // 'write' updates the data stored here, lettuce do that first.
    // since these aren't typed yet, datagram should always be a uint8_t array
    // idea: keep underlying data as serialized arrayBuffer in all js?  
    this.data = datagram.slice(0) // the best way to copy an array in js 
    // now send everything, then return 
    return this.transmit()
  }

  this.transmit = () => {
    // tries transmitting data to all defined routes 
    return new Promise((resolve, reject) => {
      reject("transmit")
    })
  }
}