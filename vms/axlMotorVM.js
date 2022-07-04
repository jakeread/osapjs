/*
axlMotorVM

holonic motion control coordinator virtual machine

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { TS } from '../core/ts.js'
import PK from '../core/packets.js'
import AXLMotionVM from './axlMotionVM.js'

export default function AXLMotorVM(osap, route, numDof = 4) {
  // same settings as the coordinator... 
  this.motion = new AXLMotionVM(osap, route, numDof)
  // defaults,
  this.settings = {
    axis: 0,
    invert: false,
    microstep: 4,
    spu: 20,
    cscale: 0.25
  }
  // and the bonus: axis, microstep, spu...
  let settingsEP = osap.endpoint()
  settingsEP.addRoute(PK.route(route).sib(6).end())
  this.setup = async () => {
    try {
      // setup the local integrator settings... 
      await this.motion.setup()
      // do also this, 
      let datagram = new Uint8Array(12)
      TS.write('uint8', this.settings.axis, datagram, 0)
      TS.write('boolean', this.settings.invert, datagram, 1)
      TS.write('uint16', this.settings.microstep, datagram, 2)
      TS.write('float32', this.settings.spu, datagram, 4)
      TS.write('float32', this.settings.cscale, datagram, 8)
      await settingsEP.write(datagram, "acked")
    } catch (err) {
      throw err
    }
  }
}