/*
vport.js

virtual port, for osap

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, TS, OT, TIMES } from './ts.js'
import { ptrLoop, handler } from './osap-utils.js'
import Vertex from './osap-vertex.js'

export default class VPort extends Vertex {
  constructor(parent, indice) {
    super(parent, indice)
  }

  /* to implement */
  // write this.onData() to receive / reply to 
  // datagrams direct to vport (not for fwding)
  // write this.cts(), returning whether / not thing is open & clear to send 
  // write this.send(buffer), putting bytes on the line 
  // on data, call this.recieve(buffer) with a uint8array arg 

  maxSegLength = 128
  type = OT.VPORT

  // phy implements this, 
  cts = function () { return false }
  send = function (buffer) { console.warn('transmitted to undefined vport send fn') }

  receive = function (buffer) {
    // find the ptr, shift arrival in 
    let ptr = ptrLoop(buffer)
    // check ptr walk was ok, do once here to help handler, 
    // which may be called multiple times on flowcontrol state 
    if (ptr == undefined) {
      console.log("pop for bad ptr walk at vport")
      return
    }
    // datagram goes straight through 
    this.handle(buffer, ptr)
  }

} // end vPort def
