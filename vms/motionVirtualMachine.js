/*
motionVirtualMachine.js

js handles on embedded smoothieroll 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { TS } from '../../osapjs/core/ts.js'
import PK from '../../osapjs/core/packets.js'
import { delay } from '../../osapjs/core/time.js'

export default function MotionVM(osap, route) {
  // ok: we make an 'endpoint' that will transmit moves,
  let moveEP = osap.endpoint()
  // add the machine head's route to it, 
  moveEP.addRoute(PK.route(route).sib(2).end())
  // and set a long timeout,
  moveEP.setTimeoutLength(60000)
  // move like: { position: {X: num, Y: num, Z: num}, rate: num }
  this.addMoveToQueue = (move) => {
    // write the gram, 
    let wptr = 0
    let datagram = new Uint8Array(20)
    // write rate 
    if(rateOverride.state){
      move.rate = rateOverride.rate 
    }
    if(isNaN(move.rate) || isNaN(move.position.X) || isNaN(move.position.Y) || isNaN(move.position.Z)){
      console.error("NaN in move request")
      console.log(move)
      return
    }
    console.log(move.rate)
    wptr += TS.write('float32', move.rate, datagram, wptr, true)
    // write posns 
    wptr += TS.write('float32', move.position.X, datagram, wptr, true)
    wptr += TS.write('float32', move.position.Y, datagram, wptr, true)
    wptr += TS.write('float32', move.position.Z, datagram, wptr, true)
    if (move.position.E) {
      //console.log(move.position.E)
      //wptr += TS.write('float32', 0, datagram, wptr, true)
      wptr += TS.write('float32', move.position.E, datagram, wptr, true)
    } else {
      wptr += TS.write('float32', 0, datagram, wptr, true)
    }
    // do the networking, 
    return new Promise((resolve, reject) => {
      moveEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => {
        reject(err)
      })
    })
  }

  let rateOverride = { state: false, rate: 10 }
  this.overrideAllRates = (rate) => {
    console.warn(`MOTION: overriding all rates to ${rate} units/s`)
    rateOverride = { state: true, rate: rate } 
  }
  this.stopRateOverride = () => {
    rateOverride.state = false 
  }

  // to set the current position, 
  let setPosEP = osap.endpoint()
  setPosEP.addRoute(PK.route(route).sib(3).end())//TS.route().portf(0).portf(1).end(), TS.endpoint(0, 2), 512)
  setPosEP.setTimeoutLength(10000)
  this.setPos = (pos) => {
    let wptr = 0
    let datagram = new Uint8Array(16)
    wptr += TS.write('float32', pos.X, datagram, wptr, true)
    wptr += TS.write('float32', pos.Y, datagram, wptr, true)
    wptr += TS.write('float32', pos.Z, datagram, wptr, true)
    if (pos.E) {
      wptr += TS.write('float32', pos.E, datagram, wptr, true)
    } else {
      wptr += TS.write('float32', 0, datagram, wptr, true)
    }
    // ship it 
    return new Promise((resolve, reject) => {
      setPosEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => { reject(err) })
    })
  }

  // an a 'query' to check current position 
  let posQuery = osap.query(PK.route(route).sib(3).end()) //TS.route().portf(0).portf(1).end(), TS.endpoint(0, 2), 512)
  this.getPos = () => {
    return new Promise((resolve, reject) => {
      posQuery.pull().then((data) => {
        let pos = {
          X: TS.read('float32', data, 0, true),
          Y: TS.read('float32', data, 4, true),
          Z: TS.read('float32', data, 8, true),
          E: TS.read('float32', data, 12, true)
        }
        resolve(pos)
      }).catch((err) => { reject(err) })
    })
  }

  // query for (time of query) speeds 
  let vQuery = osap.query(PK.route(route).sib(4).end())
  this.getSpeeds = () => {
    return new Promise((resolve, reject) => {
      vQuery.pull().then((data) => {
        let speeds = {
          X: TS.read('float32', data, 0, true),
          Y: TS.read('float32', data, 4, true),
          Z: TS.read('float32', data, 8, true),
          E: TS.read('float32', data, 12, true)
        }
        resolve(speeds)
      }).catch((err) => { reject(err) })
    })
  }

  // another query to see if it's currently moving, 
  // update that endpoint so we can 'write halt' / 'write go' with a set 
  let motionQuery = osap.query(PK.route(route).sib(5).end())//TS.route().portf(0).portf(1).end(), TS.endpoint(0, 3), 512)
  this.getMotionState = () => {
    return new Promise((resolve, reject) => {
      motionQuery.pull().then((data) => {
        if (data[0] > 0) {
          resolve(true)
        } else {
          resolve(false)
        }
      }).catch((err) => {
        reject(err)
      })
    })
  }

  this.awaitMotionEnd = () => {
    return new Promise((resolve, reject) => {
      let check = () => {
        motionQuery.pull().then((data) => {
          if (data[0] > 0) {
            setTimeout(check, 50)
          } else {
            resolve()
          }
        }).catch((err) => {
          reject(err)
        })
      }
      setTimeout(check, 50)
    })
  }

  // an endpoint to write 'wait time' on the remote,
  let waitTimeEP = osap.endpoint()
  waitTimeEP.addRoute(PK.route(route).sib(6).end())//TS.route().portf(0).portf(1).end(), TS.endpoint(0, 4), 512)
  this.setWaitTime = (ms) => {
    return new Promise((resolve, reject) => {
      let datagram = new Uint8Array(4)
      TS.write('uint32', ms, datagram, 0, true)
      waitTimeEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => { reject(err) })
    })
  }

  this.delta = async (move, rate, awaitCompletion = true) => {
    try {
      if (!rate) rate = 6000
      await this.setWaitTime(1)
      await delay(5)
      await this.awaitMotionEnd()
      let cp = await this.getPos()
      await this.addMoveToQueue({
        position: { X: cp.X + move[0], Y: cp.Y + move[1], Z: cp.Z + move[2] },
        rate: rate
      })
      if(awaitCompletion){
        await delay(5)
        await this.awaitMotionEnd()
        await this.setWaitTime(100)  
      }
    } catch (err) {
      console.error('arising during delta')
      throw err
    }
  }

  // for spot moves... stub, should do if no info (missing rate, missing axis) fills in with current 
  this.goTo = async (move) => {
    try {
      await this.awaitMotionEnd()
      await this.setWaitTime(10)
      await this.addMoveToQueue(move)
      await delay(5)
      await this.awaitMotionEnd()
      await this.setWaitTime(1000)
    } catch (err) { throw err }
  }

  // endpoint to set per-axis accelerations,
  let accelEP = osap.endpoint()
  accelEP.addRoute(PK.route(route).sib(7).end())
  this.setAccels = (accels) => {
    // mm/sec/sec 
    let wptr = 0
    let datagram = new Uint8Array(16)
    wptr += TS.write('float32', accels.X, datagram, wptr, true)
    wptr += TS.write('float32', accels.Y, datagram, wptr, true)
    wptr += TS.write('float32', accels.Z, datagram, wptr, true)
    if (accels.E) {
      wptr += TS.write('float32', accels.E, datagram, wptr, true)
    } else {
      wptr += TS.write('float32', 0, datagram, wptr, true)
    }
    return new Promise((resolve, reject) => {
      accelEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => { reject(err) })
    })
  }

  let rateEP = osap.endpoint()
  rateEP.addRoute(PK.route(route).sib(8).end())
  this.setMaxRates = (rates) => {
    // mm / sec 
    let wptr = 0
    let datagram = new Uint8Array(16)
    wptr += TS.write('float32', rates.X, datagram, wptr, true)
    wptr += TS.write('float32', rates.Y, datagram, wptr, true)
    wptr += TS.write('float32', rates.Z, datagram, wptr, true)
    if (rates.E) {
      wptr += TS.write('float32', rates.E, datagram, wptr, true)
    } else {
      wptr += TS.write('float32', 100, datagram, wptr, true)
    }
    return new Promise((resolve, reject) => {
      rateEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => { reject(err) })
    })
  }

  let spuEP = osap.endpoint()
  spuEP.addRoute(PK.route(route).sib(9).end())
  this.setSPUs = (spus) => {
    // steps / unit 
    let wptr = 0
    let datagram = new Uint8Array(16)
    wptr += TS.write('float32', spus.X, datagram, wptr, true)
    wptr += TS.write('float32', spus.Y, datagram, wptr, true)
    wptr += TS.write('float32', spus.Z, datagram, wptr, true)
    wptr += TS.write('float32', spus.E, datagram, wptr, true)
    return new Promise((resolve, reject) => {
      spuEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => { reject(err) })
    })
  }

  let powerEP = osap.endpoint() 
  powerEP.addRoute(PK.route(route).sib(10).end())
  let powerQuery = osap.query(PK.route(route).sib(10).end())

  this.setPowerStates = (v5, v24) => {
    // 5v on / off, 24v on / off, 
    let wptr = 0;
    let datagram = new Uint8Array(2)
    wptr += TS.write('boolean', v5, datagram, wptr, true)
    wptr += TS.write('boolean', v24, datagram, wptr, true)
    return new Promise((resolve, reject) => {
      powerEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => { reject(err) })
    })
  }

  this.getPowerStates = () => {
    return new Promise((resolve, reject) => {
      powerQuery.pull().then((data) => {
        resolve(data) 
      }).catch((err) => { reject(err) })
    })
  }

  // ------------------------------------------------------ JS API 

  this.config = {
    accel: { // mm/sec/sec
      X: 1000,
      Y: 1000,
      Z: 1000,
      E: 1000
    },
    maxRate: {  // mm/sec 
      X: 100,
      Y: 100,
      Z: 100,
      E: 100
    },
    spu: {
      X: 40,
      Y: 40,
      Z: 40, 
      E: 40
    }
  }

  this.settings = (settings) => {
    // this could be a proper forever-recursion to diff against 
    // default config setup... however;
    for (let key in settings) {
      if (key == 'accel' && key in this.config) {
        for (let axis in settings.accel) {
          if (axis in this.config.accel) {
            this.config.accel[axis] = settings.accel[axis]
          } else {
            console.warn(`motion/accel settings spec axis '${axis}', it doesn't exist`)
          }
        }
      } else if (key == 'maxRate' && key in this.config) {
        for (let axis in settings.maxRate) {
          if (axis in this.config.maxRate) {
            this.config.maxRate[axis] = settings.maxRate[axis]
          } else {
            console.warn(`motion/maxRate settings spec axis '${axis}', it doesn't exist`)
          }
        }
      } else if (key == 'spu' && key in this.config) {
        for(let axis in settings.spu){
          if(axis in this.config.spu){
            this.config.spu[axis] = settings.spu[axis]
          } else {
            console.warn(`motion/spu settings spec axis '${axis}', it doesn't exist`)
          }
        }
      } else {
        console.warn(`motion settings spec key '${key}', it doesn't exist!`)
      }
    }
    // watch for bad keys ? 
  }

  this.setup = async () => {
    try {
      await this.awaitMotionEnd()
      await this.setAccels(this.config.accel)
      await this.setMaxRates(this.config.maxRate)
      await this.setSPUs(this.config.spu)
    } catch (err) {
      throw err
    }
  }

  this.setZ = async (zPos) => {
    try {
      await this.awaitMotionEnd()
      let cPos = await this.getPos()
      console.log(cPos)
      cPos.Z = zPos // just update one 
      //cPos.X = 65
      //cPos.Y = 85
      await this.setPos(cPos)
    } catch (err) {
      throw err
    }
  }

}