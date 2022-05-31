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

import { PK, TS, VT, EP, TIMES } from '../core/ts.js'
import AXLMotionVM from './axlMotionVM.js'

let HMC_MODE_ACCEL = 1
let HMC_MODE_VELOCITY = 2
let HMC_MODE_POSITION = 3

export default function AXLMotorVM(osap, route, numDof = 4) {
  // same settings as the coordinator... 
  this.motion = new AXLMotionVM(osap, route, numDof)
  // defaults,
  this.settings = {
    // someone else should set motion settings... 
    motor: {
      axis: 0,
      invert: false,
      microstep: 4,
      spu: 20,
      cscale: 0.25
    }
  }
  // and the bonus: axis, microstep, spu...
  let settingsEP = osap.endpoint()
  settingsEP.addRoute(PK.route(route).sib(5).end())
  this.setup = async () => {
    try {
      // setup the local integrator settings... 
      await this.motion.setup()
      // do also this, 
      let datagram = new Uint8Array(12)
      TS.write('uint8', this.settings.motor.axis, datagram, 0)
      TS.write('boolean', this.settings.motor.invert, datagram, 1)
      TS.write('uint16', this.settings.motor.microstep, datagram, 2)
      TS.write('float32', this.settings.motor.spu, datagram, 4)
      TS.write('float32', this.settings.motor.cscale, datagram, 8)
      await settingsEP.write(datagram, "acked")
    } catch (err) {
      throw err
    }
  }
}