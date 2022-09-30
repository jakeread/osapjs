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

// import { TS } from '../../osapjs/core/ts.js'
// import PK from '../../osapjs/core/packets.js'

// export default function FilamentSensorVM(osap, route) {

//   let hallQuery = osap.query(PK.route(route).sib(1).end())
//   this.getHallReading = () => {
//     return new Promise((resolve, reject) => {
//       hallQuery.pull().then((data) => {
//         let reading = TS.read('float32', data, 0, true)
//         resolve (reading) 
//       }).catch((err) => { reject(err) })
//     })
//   }
// }

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

import { TS } from '../../osapjs/core/ts.js'
import PK from '../../osapjs/core/packets.js'

export default function FilamentSensorVM(osap, route) {

  let query = osap.query(PK.route(route).sib(2).end())
  this.getReadings = () => {
    return new Promise((resolve, reject) => {
      query.pull().then((data) => {
        let diameter = TS.read('float32', data, 0, true)
        let posn = TS.read('float32', data, 4, true)
        let rate = TS.read('float32', data, 8, true)
        // rate is in encoder-ticks / second ? we should normalize this to our... linear rate 
        // let count = TS.read('float32', data, 12, true)
        resolve ({
          diameter: diameter, 
          position: posn,
          rate: rate,
          // integral: count
        }) 
      }).catch((err) => { reject(err) })
    })
  }
}