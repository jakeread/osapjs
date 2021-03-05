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
import { ptrLoop } from './osap-utils.js'

export default function VPort(parent) {
  /* to implement */
  // write this.clear(), returning whether / not thing is open & clear to send 
  // write this.send(buffer), putting bytes on the line 
  // on data, call this.recieve(buffer) with a uint8array arg 

  // maximum size of packets originating on / transmitting from this thing 
  this.maxSegLength = 128 // default minimum 
  this.indice = undefined // osap sets this 

  // parent checks if we are clear to get new data 
  // note: difference between this & if clear to transmit... 
  this.clear = () => { return true }

  // handle a packet, assume well formed already:
  // in the future, these could be queries to us, so we will check
  // that the 
  this.handle = (pck, ptr) => {
    console.warn(`VP Handle: & ptr ${ptr}`)
    PK.logPacket(pck.data)
    // do like, 
    if (ptr == undefined) {
      ptr = ptrLoop(pck.data)
      if (ptr == undefined) {
        pck.handled()
        return
      }
    }
    // would do check-for-times, 
    // ... 
    ptr ++;
    // would switch now, 
    switch (pck.data[ptr]) {
      case PK.DEST:
        console.log("VPORT Destination")
        PK.logPacket(pck.data)
        break;
      case PK.PFWD.KEY:
        console.log("VPORT PFWD")
        // increment, so recipient sees ptr infront of next instruction 
        pck.data[ptr - 1] = PK.PFWD.KEY 
        pck.data[ptr] = PK.PTR 
        // would check flowcontrol / 
        this.send(pck.data)
        pck.handled()
        break;
      case PK.SIB.KEY:
        // read-out the indice, 
        let indice = TS.read('uint16', pck.data, ptr + 1)
        let next = parent.children[indice]
        if(!next){
          console.log("MISSING SIBLING")
          pck.handled() 
          return;
        }
        if(next.clear()){
          // increment block & write 
          pck.data[ptr - 1] = PK.SIB.KEY 
          TS.write('uint16', this.indice, pck.data, ptr)
          pck.data[ptr + 2] = PK.PTR 
          next.handle(pck, ptr + 2)
        }
        break;
      default:
        console.warn('vport rm packet: bad switch')
        pck.handled()
    }
  }

  // phy implements this, 
  this.send = () => { console.warn('tx to undefined vport send fn') }

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
    console.warn(`VPort Rx & ptr ${ptr}`)
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
