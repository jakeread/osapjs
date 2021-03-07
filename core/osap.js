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

import { PK, TS, VT, TIMES } from './ts.js'
import VPort from './vport.js'
import Module from './osap-module.js'
import Endpoint from './osap-endpoint.js'
import { handler, ptrLoop } from './osap-utils.js'

let LOGERRPOPS = true
let LOGRCRXBS = false
let LOGRX = false
let LOGTX = false

export default function OSAP() {
  // has no parent, is local root 
  this.type = VT.ROOT
  // the node's children / objects 
  this.children = []

  // children factories 
  this.vPort = () => {
    let np = new VPort(this, this.children.length)
    this.children.push(np)
    return np
  }
  this.module = () => {
    let md = new Module(this, this.children.length)
    this.children.push(md)
    return md
  }
  this.endpoint = () => {
    let ep = new Endpoint(this, this.children.length)
    this.children.push(ep)
    return ep
  }

  // same as our children...

  this.clear = () => { return true }

  this.onData = (pck, ptr) => {
    console.log("root onData")
  }

  this.handle = (pck, ptr) => {
    // pck is released from wherever it was before, so 
    throw new Error("handle at root")
  }

} // end OSAP
