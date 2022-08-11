/*
axlMotionVM

holonic motion control coordinator virtual machine

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { TS, EP } from '../core/ts.js'
import PK from '../core/packets.js'
import { settingsDiff } from '../utes/diff.js'

let AXL_MODE_ACCEL = 1
let AXL_MODE_VELOCITY = 2
let AXL_MODE_POSITION = 3
let AXL_MODE_QUEUE = 4

export default function AXLMotionVM(osap, route, _settings) {

  // defaults, 
  this.settings = {
    junctionDeviation: 0.05,
    accelLimits: [100, 100, 100, 100],
    velLimits: [100, 100, 100, 100]
  }

  // if present, check against 
  if (_settings) {
    settingsDiff(this.settings, _settings, "axlMotionVM")
    this.settings = JSON.parse(JSON.stringify(_settings))
  }
  
  let numDof = this.settings.accelLimits.length 

  // -------------------------------------------- States

  let setStatesEP = osap.endpoint("axlStateMirror")
  setStatesEP.addRoute(PK.route(route).sib(2).end())

  this.writeStates = (mode, vals, set = false) => {
    return new Promise((resolve, reject) => {
      if (vals.length != numDof) {
        reject(`need array of len ${numDof} dofs, was given ${vals.length}`);
        return;
      }
      // pack, 
      let datagram = new Uint8Array(numDof * 4 + 2)
      datagram[0] = mode
      // set, or target?
      set ? datagram[1] = 1 : datagram[1] = 0;
      // write args... 
      for (let a = 0; a < numDof; a++) {
        TS.write("float32", vals[a], datagram, a * 4 + 2)
      }
      // ship it, 
      setStatesEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => { reject(err) })
    })
  }

  this.broadcastStates = (mode, vals, route, set = false) => {
    console.warn(`! this needs an improvement / more thought...`)
    if (vals.length != numDof) {
      reject(`need array of len ${numDof} dofs, was given ${vals.length}`);
      return;
    }
    // pack, 
    let payload = new Uint8Array(numDof * 4 + 2 + 2)
    let wptr = 0
    payload[0] = PK.DEST
    payload[1] = EP.SS_ACKLESS
    payload[2] = mode
    // set, or target?
    payload[3] = set ? 1 : 0;
    // write args... 
    for (let a = 0; a < numDof; a++) {
      TS.write("float32", vals[a], payload, a * 4 + 2 + 2)
    }
    // make packet, 
    let datagram = PK.writeDatagram(route, payload)
    PK.logPacket(datagram)
    // handle it?
    osap.handle(datagram)
  }

  this.broadcastVelocity = (vels, route) => {
    return this.broadcastStates(AXL_MODE_VELOCITY, vels, route)
  }

  this.setPosition = async (posns) => {
    await this.awaitMotionEnd()
    return this.writeStates(AXL_MODE_POSITION, posns, true)
  }

  this.targetPosition = (posns) => {
    return this.writeStates(AXL_MODE_POSITION, posns, false)
  }

  this.targetVelocity = (vels) => {
    return this.writeStates(AXL_MODE_VELOCITY, vels, false)
  }

  let statesQuery = osap.query(PK.route(route).sib(2).end())
  this.getStates = () => {
    return new Promise((resolve, reject) => {
      statesQuery.pull().then((data) => {
        let states = {
          positions: [],
          velocities: [],
          accelerations: []
        }
        switch (data[0]) {
          case AXL_MODE_POSITION:
            states.mode = "position"
            break;
          case AXL_MODE_ACCEL:
            states.mode = "accel"
            break;
          case AXL_MODE_VELOCITY:
            states.mode = "velocity"
            break;
          case AXL_MODE_QUEUE:
            states.mode = "queue"
            break;
          default:
            states.mode = "unrecognized"
            break;
        }
        data[1] ? states.motion = true : states.motion = false;
        for (let a = 0; a < numDof; a++) {
          states.positions.push(TS.read("float32", data, a * 4 + numDof * 4 * 0 + 2))
        }
        for (let a = 0; a < numDof; a++) {
          states.velocities.push(TS.read("float32", data, a * 4 + numDof * 4 * 1 + 2))
        }
        for (let a = 0; a < numDof; a++) {
          states.accelerations.push(TS.read("float32", data, a * 4 + numDof * 4 * 2 + 2))
        }
        resolve(states)
      }).catch((err) => { reject(err) })
    })
  }

  this.awaitMotionEnd = () => {
    return new Promise((resolve, reject) => {
      let check = () => {
        this.getStates().then((states) => {
          if (states.motion) {
            setTimeout(check, 5)
          } else {
            resolve()
          }
        })
      }
      check()
    })
  }

  // -------------------------------------------- Halt 

  let haltEP = osap.endpoint("axlHaltMirror")
  haltEP.addRoute(PK.route(route).sib(3).end())
  this.halt = async () => {
    try {
      await haltEP.write(new Uint8Array([1]), "acked");
      console.warn(`wrote halt... awaiting motion end`)
      await this.awaitMotionEnd()
      console.warn(`motion-ended`)
    } catch (err) {
      throw err
    }
  }

  // -------------------------------------------- Add Move

  let addMoveEP = osap.endpoint("axlMoveMirror")
  addMoveEP.addRoute(PK.route(route).sib(4).end())
  addMoveEP.setTimeoutLength(60000)
  // hackney, 
  let lastPos = [0, 0, 0, 0]
  let liftZ = 2
  let lastTheta = 0
  let thetaIncrements = 0
  // move like { target: <float array of len numDof>, rate: <number> }
  this.addMoveToQueue = async (move) => {
    try {
      // I'm going to hack this up to add theta-down-move-up junctions everywhere... 
      if (move.target.length != numDof) {
        throw new Error(`move has ${move.target.length} dofs, AXL is config'd for ${numDof}`);
      }
      let datagram = new Uint8Array(numDof * 4 + 4)
      TS.write("float32", move.rate, datagram, 0)
      for (let a = 0; a < numDof; a++) {
        TS.write("float32", move.target[a], datagram, 4 * a + 4)
      }
      await addMoveEP.write(datagram, "acked")
    } catch (err) {
      throw err
    }
  }

  // -------------------------------------------- Settings

  let settingsEP = osap.endpoint("axlSettingsMirror")
  settingsEP.addRoute(PK.route(route).sib(5).end())
  this.setup = async () => {
    // console.log(this.settings.accelLimits)
    let datagram = new Uint8Array(4 + numDof * 4 * 2)
    TS.write("float32", this.settings.junctionDeviation, datagram, 0);
    for (let a = 0; a < numDof; a++) {
      TS.write("float32", this.settings.accelLimits[a], datagram, 4 + a * 8)
      TS.write("float32", this.settings.velLimits[a], datagram, 4 + a * 8 + 4)
    }
    //console.warn('gram', datagram)
    try {
      await settingsEP.write(datagram, "acked")
    } catch (err) {
      throw err
    }
  }

}