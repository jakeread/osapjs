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

import { PK, TIMES, TS } from './ts.js'
import { ptrLoop, handler } from './osap-utils.js'

export default function VPort(parent) {
  /* to implement */
  // write this.clear(), returning whether / not thing is open & clear to send 
  // write this.send(buffer), putting bytes on the line 
  // on data, call this.recieve(buffer) with a uint8array arg 

  // maximum size of packets originating on / transmitting from this thing 
  this.maxSegLength = 128 // default minimum 
  this.parent = parent 
  this.indice = undefined // osap sets this 
  this.type = "vport"

  // parent checks if we are clear to get new data 
  // note: difference between this & if clear to transmit... 
  this.clear = () => { return true }

  this.onData = (pck, ptr) => {
    console.log("vPort onData")
  }

  // handler is functional / contextual, 
  this.handle = (pck, ptr) => {
    handler(this, pck, ptr)
  }

  // phy implements this, 
  this.send = () => { console.warn('transmitted to undefined vport send fn') }

  // fire this code when your port receive a packet 
  this.receive = (buffer) => {
    // find the ptr, shift arrival in 
    let ptr = ptrLoop(buffer)
    // check ptr walk was ok, 
    if (ptr == undefined) {
      console.log("pop for bad ptr walk at vport")
      pck.handled()
      return
    }
    // tx'er had same structure, so 
    console.log(`VPort Rx & ptr ${ptr}`)
    PK.logPacket(buffer)
    // hot damn we can just throw this into the mixer, 
    let msg = {
      data: buffer,
      origin: this,
      arrivalTime: TIMES.getTimeStamp(),
      handled: function () {
        console.log("HANDLED from VPort origin")
      }
    }
    // should just be like, 
    this.handle(msg, ptr)
  }

} // end vPort def
