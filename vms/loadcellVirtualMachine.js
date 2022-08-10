/*
loadcellVirtualMachine.js

vm for loadcell modules 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { TS } from '../core/ts.js'
import TIME from '../core/time.js'
import PK from '../core/packets.js'
import LeastSquares from '../client/utes/lsq.js'

export default function LoadVM(osap, route) {
  // want a calibration 
  let lsq = [new LeastSquares(), new LeastSquares(), new LeastSquares()]
  this.offsets = [0, 0, 0]

  this.setObservations = (units, xy) => {
    if (units == 'grams') {
      for (let ch = 0; ch < 3; ch++) {
        for (let i = 0; i < xy[ch][1].length; i++) {
          xy[ch][1][i] = xy[ch][1][i] * 0.00980665;
        }
        lsq[ch].setObservations(xy[ch])
        console.log(`lsq[${ch}]: `, lsq[ch].printFunction())
      }
    }
  }

  let readingQuery = osap.query(PK.route(route).sib(2).end())
  this.getReading = (offset = true, raw = false) => {
    return new Promise((resolve, reject) => {
      readingQuery.pull().then((data) => {
        let readings = [
          TS.read("int32", data, 0, true),
          TS.read("int32", data, 4, true),
          TS.read("int32", data, 8, true)
        ]
        let calibrated = [0, 0, 0]
        let offset = [0, 0, 0]
        for (let ch = 0; ch < 3; ch++) {
          calibrated[ch] = lsq[ch].predict(readings[ch])
          offset[ch] = calibrated[ch] + this.offsets[ch]
        }
        if (!offset) {
          resolve(calibrated)
        } else if (raw) {
          resolve(readings)
        } else {
          resolve(offset)
        }
      }).catch((err) => { reject(err) })
    })
  }

  this.tare = () => {
    return new Promise((resolve, reject) => {
      this.getReading(false).then((rd) => {
        for (let ch = 0; ch < 3; ch++) {
          this.offsets[ch] = -rd[ch]
        }
        resolve()
      }).catch((err) => {
        reject(err)
      })
    })
  }

  // assuming zero-load when we call this, sets comparator to trigger on next tap 
  this.setupTapComparator = async (dir, offset, avgCount = 10) => {
    try {
      // we want to collect a sum of reading first, 
      let sum = 0
      for (let s = 0; s < avgCount; s++) {
        let readings = await this.getReading(false, true)
        await TIME.delay(50)
        // console.log(readings[0])
        sum += readings[0]
      }
      sum = sum / avgCount
      console.log(`LC: floating around ${sum}`)
      // so we want to set the comparator so that... 
      if (dir == "negative") {
        dir = 0
        offset = sum - Math.abs(offset)
      } else if (dir == "positive") {
        dir = 1
        offset = sum + Math.abs(offset)
      } else {
        throw new Error("loadcell setup direction ambiguious, pls use 'negative' or 'positive'")
      }
      // we can setup now, 
      await this.setComparator(offset, dir)
    } catch (err) {
      throw err
    }
  }

  // for the comparator... 
  let cmpEP = osap.endpoint()
  cmpEP.addRoute(PK.route(route).sib(3).end())
  this.setComparator = async (val, dir) => {
    try {
      let datagram = new Uint8Array(5)
      datagram[0] = dir ? 1 : 0;
      TS.write('int32', val, datagram, 1)
      await cmpEP.write(datagram, "acked")
    } catch (err) {
      throw err
    }
  }
}