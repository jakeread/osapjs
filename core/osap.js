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

export default function OSAP(parent) {
  // the node's children / objects 
  this.children = []

  // children factories 
  this.vPort = () => {
    let np = new VPort(this)
    np.indice = this.children.length
    this.children.push(np)
    return np
  }
  this.module = () => {
    let md = new Module(this)
    md.indice = this.children.length
    this.children.push(md)
    return md
  }
  this.endpoint = () => {
    let ep = new Endpoint(this)
    ep.indice = this.children.length
    this.children.push(ep)
    return ep
  }

  // ------------------------------------------------------ SCAN RX ROUTINE

  this.handle = (pck, ptr) => {
    // req's to parent, 
    console.warn(`OSAP Root Handle: & ptr ${ptr}`)
    PK.logPacket(pck.data)
    pck.handled() 
  }

} // end OSAP
