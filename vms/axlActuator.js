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

  // write state requests direct to this motor, 
  let stateRequestsOutEP = osap.endpoint("motorStateMirror")
  stateRequestsOutEP.addRoute(PK.route(route).sib(3).end())

  let AXL_MODE_ACCEL = 1
  let AXL_MODE_VELOCITY = 2
  let AXL_MODE_POSITION = 3
  let AXL_MODE_QUEUE = 4

  this.writeStateBroadcast = async (vals, mode, set) => {
    try {
      if(vals.length != numDof) throw new Error(`state-write request with ${vals.length} DOF, actuator should have ${numDof}`)
      // pack 'em up, 
      let datagram = new Uint8Array(numDof * 4 + 2)
      let wptr = 0
      datagram[wptr++] = mode 
      datagram[wptr++] = set  
      for (let a = 0; a < numDof; a++) {
        wptr += TS.write("float32", vals[a], datagram, wptr)
      }
      // and send it along on our broadcast channel, 
      await stateRequestsOutEP.write(datagram, "ackless")
    } catch (err) {
      throw err
    }
  }

  this.gotoVelocity = async (vel) => {
    try {
      // vel = this.cartesianToActuatorTransform(vel)
      await this.writeStateBroadcast(vel, AXL_MODE_VELOCITY, false)
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

  let stateQuery = null 
    this.getStates = async () => {
    try {
      if(!stateQuery) throw new Error("on getState, query isn't yet setup")
      let data = await stateQuery.pull()
      let rptr = 0 
      let state = {
        positions: [],
        velocities: [],
        accelerations: [],
        target: []
      }
      for(let a = 0; a < numDof; a ++){
        state.positions.push(TS.read('float32', data, rptr + 0))
        state.velocities.push(TS.read('float32', data, rptr + 4))
        state.accelerations.push(TS.read('float32', data, rptr + 8))
        state.target.push(TS.read('float32', data, rptr + 12))
        rptr += 16
      }
      state.segDistance = TS.read('float32', data, rptr += 4)
      state.segVel = TS.read('float32', data, rptr += 4)
      state.segAccel = TS.read('float32', data, rptr += 4)
      state.mode = data[rptr ++]
      state.haltState = data[rptr ++]
      state.queueState = data[rptr ++]
      state.headIndice = data[rptr ++]
      state.tailIndice = data[rptr ++]
      return state 
      /*
        // vect_t's 
        for(uint8_t a = 0; a < AXL_NUM_DOF; a ++){
          ts_writeFloat32(state.positions.axis[a], data, &wptr);
          ts_writeFloat32(state.velocities.axis[a], data, &wptr);
          ts_writeFloat32(state.accelerations.axis[a], data, &wptr);
          ts_writeFloat32(state.target.axis[a], data, &wptr);
        }
        // inter-segment state, 
        ts_writeFloat32(state.segDistance, data, &wptr);
        ts_writeFloat32(state.segVel, data, &wptr);
        ts_writeFloat32(state.segAccel, data, &wptr);
        // mode, halt state, queue state, and queue pointer positions 
        ts_writeUint8(state.mode, data, &wptr);
        ts_writeUint8(state.haltState, data, &wptr);
        ts_writeUint8(state.queueState, data, &wptr);
        ts_writeUint8(state.head->indice, data, &wptr);
        ts_writeUint16(state.tail->indice, data, &wptr);
      */
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
      // and the *state* endpoint... 
      let stateVVT = await osap.nr.findWithin("ep_axlState", this.settings.name)
      stateQuery = osap.query(PK.VC2EPRoute(stateVVT.route))
      await this.setupAxl()
      await this.setupMotor()
    } catch (err) {
      throw err
    }
  }
}