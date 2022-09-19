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
  if (_settings) {
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
        wptr += TS.write("float32", this.settings.velocityLimits[a], datagram, wptr)
      }
      wptr += TS.write("uint32", this.settings.queueStartDelay, datagram, wptr)
      wptr += TS.write("uint8", this.settings.actuatorID, datagram, wptr)
      await axlSettingsEP.write(datagram, "acked")
    } catch (err) {
      throw err
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

  let motionStateQuery = null

  this.awaitMotionEnd = async () => {
    try {
      if (!motionStateQuery) throw new Error("on awaitMotionEnd, query isn't yet setup")
      return new Promise((resolve, reject) => {
        let check = async () => {
          let state = await motionStateQuery.pull()
          // console.log(state)
          if (state[0] == 0) {
            resolve()
          } else {
            setTimeout(check, 0)
          }
        }
        check()
      })
    } catch (err) {
      throw err
    }
  }

  let limitStateQuery = null 

  this.getLimitState = async () => {
    try {
      if (!limitStateQuery) throw new Error("on getLimitState, query isn't yet setup")
      let data = await limitStateQuery.pull()
      return (data[0] > 0)
    } catch (err) {
      throw err 
    }
  }

  this.setup = async () => {
    try {
      // find the motion state endpoint... 
      let motionStateVVT = await osap.nr.findWithin("ep_motionState", this.settings.name)
      motionStateQuery = osap.query(PK.VC2EPRoute(motionStateVVT.route))
      // and the limit state endpoint... 
      let limitStateVVT = await osap.nr.findWithin("ep_limitSwitchState", this.settings.name)
      limitStateQuery = osap.query(PK.VC2EPRoute(limitStateVVT.route))
      await this.setupAxl()
      await this.setupMotor()
    } catch (err) {
      throw err
    }
  }
}