/*
axlActuator.js

axl motion controller actuator model 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) and AXL projects 
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import PK from '../core/packets.js'
import { TS, VT } from '../core/ts.js'
import TIME from '../core/time.js'

import { settingsDiff } from '../utes/diff.js'

export default function AXLActuator(osap, route, _settings) {
  // default settings, for now assuming all stepper motors, can bust that up later 
  this.settings = {
    name: "rt_unknownActuator",
    accelLimits: [100, 100, 100],
    velocityLimits: [100, 100, 100],
    queueStartDelay: 500,
    actuatorID: 0,        
    axis: 0,            // this & below are ~ motor-type specific, which we can bust out later 
    invert: false,          
    microstep: 4, 
    spu: 20, 
    cscale: 0.25, 
  }
  // diff for extra or missing keys 
  if(_settings) {
    settingsDiff(this.settings, _settings, "AXLActuator")
    this.settings = JSON.parse(JSON.stringify(_settings))
  }
  // count DOF 
  let numDof = this.settings.accelLimits.length 

  let axlSettingsEP = osap.endpoint("axlSettingsMirror")
  axlSettingsEP.addRoute(PK.route(route).sib(2).end())

  this.setupAxl = async () => {
    try {
      let datagram = new Uint8Array(numDof * 4 * 2 + 4 + 1)
      let wptr = 0 
      for (let a = 0; a < numDof; a++) {
        wptr += TS.write("float32", this.settings.accelLimits[a], datagram, wptr)
        wptr += TS.write("float32", this.settings.velLimits[a], datagram, wptr)
      }
      wptr += TS.write("uint32", this.settings.queueStartDelay, datagram, wptr)
      wptr += TS.write("uint8", this.settings.actuatorID, datagram, wptr)
      await axlSettingsEP.write(datagram, "acked")
    } catch (err) {

    }
  }

  // we could do a states-ep write w/ a mirror here, but normally do this with a broadcast anyways... 

  let motorSettingsEP = osap.endpoint("motorSettingsMirror")
  motorSettingsEP.addRoute(PK.route(route).sib(9).end())

  this.setupMotor = async () => {
    try {
      let datagram = new Uint8Array(12)
      TS.write('uint8', this.settings.axis, datagram, 0)
      TS.write('boolean', this.settings.invert, datagram, 1)
      TS.write('uint16', this.settings.microstep, datagram, 2)
      TS.write('float32', this.settings.spu, datagram, 4)
      TS.write('float32', this.settings.cscale, datagram, 8)
      await motorSettingsEP.write(datagram, "acked")
    } catch (err) {
      throw err 
    }
  }

  this.setup = async () => {
    try {
      await this.setupAxl()
      await this.setupMotor()
    } catch (err) {
      throw err
    }
  }
}