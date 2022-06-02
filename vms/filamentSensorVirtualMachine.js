/*
filamentSensorVM.js

vm for filament sensor 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, TS } from '../../osapjs/core/ts.js'

export default function FilamentSensorVM(osap, route) {

  let bundleQuery = osap.query(PK.route(route).sib(2).end())
  this.getBundle = () => {
    return new Promise((resolve, reject) => {
      bundleQuery.pull().then((data) => {
        let bundle = {
          diameter: TS.read('float32', data, 0, true),
          posEstimate: TS.read('float32', data, 4, true),
          rateEstimate: TS.read('float32', data, 8, true)
        }
        // now... pos & rate should be divided by the circumference * encoder ticks of the thing, 
        // which is 2^14 bits and 19mm * PI OD, 
        // so each 16k counts is 19*PI mm of travel, 
        let convert = (19*Math.PI) / (2**14-1)
        //console.log(convert)
        bundle.posEstimate *= convert
        bundle.rateEstimate *= convert 
        resolve(bundle) 
      }).catch((err) => { reject(err) })
    })
  }
}