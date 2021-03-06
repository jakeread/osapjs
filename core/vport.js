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

export default function VPort(parent) {
  /* to implement */
  // write this.clear(), returning whether / not thing is open & clear to send 
  // write this.send(buffer), putting bytes on the line 
  // on data, call this.recieve(buffer) with a uint8array arg 

  // maximum size of packets originating on / transmitting from this thing 
  this.maxSegLength = 128 // default minimum 
  this.parent = parent 
  this.indice = undefined // osap sets this 
  this.type = OT.VPORT

  // parent checks if we are clear to get new data 
  this.clear = () => { 
    return true 
  }

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
    //console.log(`VPort Rx & ptr ${ptr}`)
    //PK.logPacket(buffer)
    // hot damn we can just throw this into the mixer, 
    let pck = {
      data: buffer,
      origin: this,
      arrivalTime: TIMES.getTimeStamp(),
      state: "awaiting",
      timer: null,
      handled: function () {
        this.state = "transmitted"
        console.log("HANDLED from VPort origin")
      }
    }
    // push it through, against backpressure 
    let check = () => {
      switch (pck.state){
        case "awaiting":
          this.handle(pck, ptr)
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
    // don't try too hard 
    setTimeout(() => {
      pck.state = "timeout"
    }, TIMES.staleTimeout)
    // kick process
    check() 
  }

} // end vPort def
