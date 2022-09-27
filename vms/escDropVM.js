/*
escDropVM.js

vm for barebones esc-controller module

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { TS } from '../../osapjs/core/ts.js'
import PK from '../../osapjs/core/packets.js'

export default function ESCDropVM(osap, route) {
  let dutyEP = osap.endpoint("dutyMirror")
  dutyEP.addRoute(PK.route(route).sib(2).end())
  // PK.logRoute(route)

  this.setDuty = async (duty) => {
    try {
      let datagram = new Uint8Array(4)
      TS.write('float32', duty, datagram, 0)
      await dutyEP.write(datagram, "acked")
    } catch (err) {
      throw err 
    }
  }
}

// 0.1 -> nok RPM
// 0.15 -> 2.5k RPM ~ unstable stops 
// 0.2 -> 6k RPM 
// 0.3 -> 12k RPM 6k comfortable, low harmonic 
// 0.4 -> 18k RPM 6k p loud 
// 0.5 -> 23k RPM 5k loud AF 
// 0.6 -> don't do this