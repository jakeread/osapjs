/*
bladePlateVirtualMachine.js

vm for hotplate toolchanger circuit 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, TIMES, TS } from '../../osapjs/core/ts.js'

export default function BladePlateVM(osap, route){
  // set current for servo actuator 
  let servoMicrosecondsEP = osap.endpoint()
  servoMicrosecondsEP.addRoute(PK.route(route).sib(2).end())
  this.writeServoMicroseconds = (micros) => {
    return new Promise((resolve, reject) => {
      let datagram = new Uint8Array(4)
      TS.write('uint32', micros, datagram, 0, true)
      servoMicrosecondsEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => { reject(err) })
    })
  }

  this.config = {} 
  this.config.microsClosed = 2000;
  this.config.microsOpen = 1000;

  this.setMicroSet = (closed, open) => {
    this.config.microsClosed = closed 
    this.config.microsOpen = open 
  }

  this.setLeverState = async (closed) => {
    try {
      if(closed) { 
        await this.writeServoMicroseconds(this.config.microsClosed)
      } else {
        await this.writeServoMicroseconds(this.config.microsOpen)
      }
      // takes ~ some time to close / open 
      await TIMES.delay(1000)
    } catch (err) {
      throw err 
    }
  }
}