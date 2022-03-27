/*
quantickVirtalMachine.js

vm for smart motors  

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, TS, TIMES } from '../../osapjs/core/ts.js'

export default function QuantickVM(osap, route) {
  // one to get states, 
  let stateQuery = osap.query(PK.route(route).sib(2).end())
  this.getStates = () => {
    return new Promise((resolve, reject) => {
      stateQuery.pull().then((data) => {
        let pos = TS.read('float32', data, 0)
        resolve({
          pos_est: pos
        })
      }).catch((err) => { reject (err) })
    })
  }
  // one to set modes & one to query modes, 
  // kick calib 
  let modeEP = osap.endpoint()
  modeEP.addRoute(PK.route(route).sib(3).end())
  let modeQuery = osap.query(PK.route(route).sib(3).end())
  // possible modes, 
  let QTMODES = { "disabled": 0, "calibrating": 1, "enabled": 2 }
  this.setMode = (mode) => {
    return new Promise((resolve, reject) => {
      if (QTMODES[mode]) {
        let datagram = new Uint8Array(1)
        datagram[0] = QTMODES[mode]
        modeEP.write(datagram, "acked").then(() => {
          resolve()
        }).catch((err) => { reject(err) })
      } else {
        reject(`mode ${mode} doesn't exist`)
      }
    })
  }

  this.getMode = () => {
    return new Promise((resolve, reject) => {
      modeQuery.pull().then((mode) => {
        // yikes 
        switch (mode[0]) {
          case 0:
            resolve("disabled")
            break;
          case 1:
            resolve("calibrating")
            break;
          case 2:
            resolve("enabled")
            break;
          default:
            reject(`broken mode ${mode}`);
            break;
        }
      }).catch((err) => reject(err))
    })
  }

  let encoderMapQ = osap.queryMSeg(PK.route(route).sib(4).end())
  this.getEncoderMap = async () => {
    return new Promise((resolve, reject) => {
      encoderMapQ.pull().then((data) => {
        // data is in float... use view 
        let uint8 = new Uint8Array(data)
        let floats = new Float32Array(uint8.buffer)
        resolve(floats)
      }).catch((err) => { reject(err) })  
    })
  }

  this.runCalib = async () => {
    try {
      await this.setMode("calibrating")
      let startTime = TIMES.getTimeStamp()
      while (true) {
        let mode = await this.getMode()
        ///console.log(`${mode}...`)
        if (mode != "calibrating") {
          console.log(`calibrating done, mode: ${mode}`)
          break;
        }
        // if (startTime + 50000 < TIMES.getTimeStamp()) {
        //   console.log("calibration timeout!")
        //   break;
        // }
        await TIMES.delay(100)
      }
      //let map = await this.getEncoderMap()
      //return map
    } catch (err) {
      console.error(err)
    }
  }
  // mseg / calibration 
  /*
  
  // stacked up states 
  let pulseCountQuery = osap.query(PK.route(route).sib(3).end())
  this.getPulseCount = () => {
    return new Promise((resolve, reject) => {
      pulseCountQuery.pull().then((data) => {
        let count = TS.read('uint32', data, 0)
        let pulseWidth = TS.read('float32', data, 4)
        let mpErrCount = TS.read('uint32', data, 8)
        let idxErrCount = TS.read('uint32', data, 12)
        let qErrCount = TS.read('uint32', data, 16)
        resolve([count, pulseWidth, mpErrCount, idxErrCount, qErrCount])
      }).catch((err) => { reject (err) })
    })
  }
  // make torque requests 
  let torqueRequestEP = osap.endpoint()
  torqueRequestEP.addRoute(PK.route(route).sib(4).end())
  this.setTorque = (flt) => {
    return new Promise((resolve, reject) => {
      // -1.0 -> 1.0, embedded will clamp 
      let wptr = 0
      let datagram = new Uint8Array(4)
      wptr += TS.write('float32', flt, datagram, wptr)
      torqueRequestEP.write(datagram, "acked").then(() => {
        resolve()
      }).catch((err) => { reject(err) })
    })
  }
  */
}