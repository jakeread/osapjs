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
  this.type = PK.PORTF.KEY 

  // parent checks if we are clear to get new data 
  this.clear = () => { false }

  // implemented at vport instance, 
  this.handle = (buffer) => { throw new Error('no vport send fn') }

  // fire this code when your port receive a packet 
  this.receive = (buffer) => {
    console.log('vp rx')
    PK.logPacket(buffer)
    // find the ptr, shift arrival in 
    let ptr = ptrLoop(buffer)
    // tx'er had same structure, so 
    // ptr, portf, indice:2 
    buffer[ptr] = PK.PORTF.KEY 
    TS.write('uint16', this.indice, buffer, ptr + 1)
    buffer[ptr + 3] = PK.PTR 
    // issue the message to parent, to handle 
    let retryTimer = undefined 
    let msg = {
      data: buffer,
      origin: this, 
      arrivalTime: TIMES.getTimeStamp(),
      handled: function(){
        clearTimeout(retryTimer)
        console.log('vp handled')
      }
    }
    let check = () => {
      retryTimer = setTimeout(check, 0)
      parent.handle(msg)
    }
    check()
  }

} // end vPort def
