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

import { PK, TS, VT, EP, TIMES } from '../osapjs/core/ts.js'

let HMC_MODE_ACCEL = 1
let HMC_MODE_VELOCITY = 2
let HMC_MODE_POSITION = 3

export default function AXLMotionVM(osap, route, numDof) {

  // -------------------------------------------- States

  let setStatesEP = osap.endpoint()
  setStatesEP.addRoute(PK.route(route).sib(2).end())
  this.setPosition = (posns) => {
    return new Promise((resolve, reject) => {
      // guard bad accels... 
      if (posns.length != numDof) {
        reject(`need array of len ${numDof} dofs, was given ${posns.length}`);
        return;
      }
      // pack, 
      let datagram = new Uint8Array(numDof * 4 * 3 + 1)
      datagram[0] = HMC_MODE_POSITION
      // write accels, 
      for (let a = 0; a < numDof; a++) {
        TS.write("float32", 0, datagram, a * 4 + numDof * 4 * 0 + 1)
      }
      // velocities,
      for (let a = 0; a < numDof; a++) {
        TS.write("float32", 0, datagram, a * 4 + numDof * 4 * 1 + 1)
      }
      // positions, 
      for (let a = 0; a < numDof; a++) {
        TS.write("float32", posns[a], datagram, a * 4 + numDof * 4 * 2 + 1)
      }
      // ship it, 
      setStatesEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => { reject(err) })
    })
  }

  let statesQuery = osap.query(PK.route(route).sib(2).end())
  this.getStates = () => {
    return new Promise((resolve, reject) => {
      statesQuery.pull().then((data) => {
        let states = {
          mode: data[0],
          positions: [],
          velocities: [],
          accelerations: []
        }
        for (let a = 0; a < numDof; a++) {
          states.positions.push(TS.read("float32", data, a * 4 + numDof * 4 * 0 + 1))
        }
        for (let a = 0; a < numDof; a++) {
          states.velocities.push(TS.read("float32", data, a * 4 + numDof * 4 * 1 + 1))
        }
        for (let a = 0; a < numDof; a++) {
          states.accelerations.push(TS.read("float32", data, a * 4 + numDof * 4 * 2 + 1))
        }
        resolve(states)
      }).catch((err) => { reject(err) })
    })
  }

  // -------------------------------------------- Add Move

  let addMoveEP = osap.endpoint()
  addMoveEP.addRoute(PK.route(route).sib(3).end())
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

  this.settings = {
    junctionDeviation: 0.05,
    accelLimits: [100, 100, 100, 100],
    velLimits: [100, 100, 100, 100]
  }

  let settingsEP = osap.endpoint()
  settingsEP.addRoute(PK.route(route).sib(4).end())
  this.setup = async () => {
    console.log(this.settings.accelLimits)
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