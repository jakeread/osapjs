/*
axlMotorVM

holonic motion control motor virtual machine

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { TS } from '../core/ts.js'
import PK from '../core/packets.js'
import TIME from '../core/time.js'
import AXLMotionVM from './axlMotionVM.js'
import { settingsDiff } from '../utes/diff.js'

export default function AXLMotorVM(osap, route, _settings) {
  // same settings as the coordinator... 
  this.motion = new AXLMotionVM(osap, route, _settings.motion)
  // defaults,
  this.settings = {
    motion: {
      junctionDeviation: 0.05, 
      accelLimits: [2500, 2500, 2500],
      velLimits: [100, 100, 100]
    },
    axis: 0,
    invert: false,
    microstep: 4,
    spu: 20,
    cscale: 0.25,
    homeRate: -100,
    homeOffset: 100, 
  }

  // we want to diff our settings... 
  if(_settings) {
    // this throws an error if we miss anything 
    settingsDiff(this.settings, _settings, "axlMotorVM")
    this.settings = JSON.parse(JSON.stringify(_settings))
  }

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

  let homeEP = osap.endpoint()
  homeEP.addRoute(PK.route(route).sib(7).end())

  this.home = async () => {
    try {
      await this.motion.awaitMotionEnd()
      console.warn(`motor home: awaited motion end`)
      let datagram = new Uint8Array(9)
      datagram[0] = this.settings.axis
      console.warn(`setting rate, offset ${this.settings.homeRate}, ${this.settings.homeOffset}`)
      TS.write('float32', this.settings.homeRate, datagram, 1)
      TS.write('float32', this.settings.homeOffset, datagram, 5)
      await homeEP.write(datagram, "acked")
      console.warn(`wrote to homeEP`)
      await TIME.delay(250)
      await this.motion.awaitMotionEnd()
      console.warn(`motion ended`)
    } catch (err) {
      throw err 
    }
  }
}