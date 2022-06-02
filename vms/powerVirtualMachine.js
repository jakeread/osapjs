/*
powerVirtualMachine.js

js handles on embedded smoothieroll 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, TS } from '../core/ts.js'

export default function PowerVM(osap, route) {
  let powerEP = osap.endpoint()
  powerEP.addRoute(PK.route(route).sib(5).end())
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
}