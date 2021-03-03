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

import { PK, TIMES } from './ts.js'

export default function VPort(osap) {
  /* to implement */
  // write this.cts(), returning whether / not thing is open & clear to send 
  // write this.send(buffer), putting bytes on the line 
  // on data, call this.recieve(buffer) with a uint8array arg 

  // maximum size of packets originating on / transmitting from this thing 
  this.maxSegLength = 128 // default minimum 
  this.indice = undefined // osap sets this 

  // buffer of receive packets 
  this.rxBuffer = []
  let lastPulled = 0 // last pckt served 
  this.read = () => {
    if (this.rxbuffer.length > 0) {
      lastPulled++
      if (lastPulled > this.rxbuffer.length) { lastPulled = 0 }
      return this.rxBuffer[lastPulled]
    } else {
      return undefined
    }
  }

  // fire this code when your port receive a packet 
  this.receive = (buffer) => {
    // would pull rcrxb here 
    // adds to the buffer, 
    this.rxBuffer.push({
      arrivalTime: TIMES.getTimeStamp(),
      vp: this,
      data: buffer,
      clear: () => {
        console.log(this)
        throw new Error("write pck clear, what's this? ^")
      },
    })
    // has osap run the packet scan 
    osap.onVPortReceive(this)
  }

  // implemented at vport instance 
  this.send = (buffer) => { throw new Error('no vport send fn') }

  // osap checks if we are clear to send,
  this.cts = () => { false }

} // end vPort def
