/*
osap.js

protocol-abiding object, incl. links

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import { PK, TS, TIMES } from './ts.js'
import VPort from './vport.js'
import Module from './osap-module.js'
import Endpoint from './osap-endpoint.js'
import { ptrLoop } from './osap-utils.js'

let LOGERRPOPS = true
let LOGRCRXBS = false
let LOGRX = false
let LOGTX = false

export default function OSAP() {
  // the node's virtual ports, and factory for them
  this.vPorts = []
  this.vPort = () => {
    let np = new VPort(this)
    np.indice = this.vPorts.length
    this.vPorts.push(np)
    return np
  }

  // js osap has no busses for the time being, 
  this.vBusses = []

  // interior software interfaces, for now flat, could second-route,
  // modules and objects have *the same interface to osap* 
  // but we want differentiated software API for them... 
  this.objects = []
  // modules will be objects containing endpoints 
  this.module = () => {
    let md = new Module(this)
    md.indice = this.objects.length
    this.objects.push(md)
    return md
  }
  // endpoints are the code element (1st level) we will focus on for the time being, 
  this.endpoint = () => {
    let ep = new Endpoint(this)
    ep.indice = this.objects.length
    this.objects.push(ep)
    return ep
  }

  // ------------------------------------------------------ OUTGOING HANDLES

  // route: uint8array, segsize: num / datagram: uint8array
  this.send = (route, datagram) => {
    return new Promise((resolve, reject) => {
      // should just be a call to this.handle(), right? 
      reject("rmd")
    })
  }

  // ------------------------------------------------------ FORWARDING

  // pck.data[ptr] = portf, busf, or busb key
  let forward = (pck, ptr) => {
    // ok, this is where we'll send it: 
    let next = undefined
    let indice = TS.read('uint16', pck.data, ptr + 1, true)
    switch (pck.data[ptr]) {
      case PK.OBJECT.KEY:
        next = this.objects[indice]
        break;
      case PK.PORTF.KEY:
        next = this.vPorts[indice]
        break;
      default:
        if (LOGERRPOPS) console.log("errpop for fwd to non-portf, non-object")
        pck.handled()
        break;
    }
    
    // check existence 
    if (!next) {
      if (LOGERRPOPS) console.log('ERRPOP for port forward on non existent port here', indice)
      pck.handled()
      return
    }

    // check clear to handle, and handle if so 
    if (next.clear()) {
      // we want to bit shift this, so the ptr points at the next instruction, 
      // currently: 
      //                          [pck.data[ptr]]
      // [ack_instruction:3][ptr][outgoing_instruction:3]
      console.log('node fwd')
      PK.logPacket(pck.data)
      next.handle(pck.data)
      // and remove it from the incoming buffer 
      pck.handled()
    } else {
      console.log('not clear')
      // no-op, wait for cts() onbuffer status or clears out on stale-ness 
    }
  }

  // ------------------------------------------------------ SCAN RX ROUTINE

  this.handle = (pck, ptr) => {
    // told to handle, with optional helper of where ptr is likely 
    // find the ptr, 
    ptr = ptrLoop(pck.data, ptr)
    // make sure OK walk, 
    if(ptr == undefined){
      if(LOGERRPOPS){ console.log("pop for bad ptr walk") }
      pck.clear()
      return 
    }
    // handle it 
    ptr ++ 
    switch (pck.data[ptr]) {
      case PK.PORTF.KEY:
      case PK.BUSF.KEY:
      case PK.BUSB.KEY:
      case PK.OBJECT.KEY:
        if (LOGRX) console.log('RX: 4: forward')
        forward(pck, ptr)
        break;
      case PK.DEST:
        console.log("DESTINATION: NODE")
        pck.clear()
        break;
      default:
        if (LOGERRPOPS) {
          console.warn(`pop due to unrecognized instruction switch ${pck.data[ptr]}`)
          PK.logPacket(pck.data)
        }
        pck.vp.clear()
    } // end instruction-switch
  }

} // end OSAP
