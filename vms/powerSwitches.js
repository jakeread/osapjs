/*
powerSwitchesVM

quick access to any 'powerSwitches' endpoint, 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { TS } from '../core/ts.js'
import PK from '../core/packets.js'
import AXLMotionVM from './axlMotionVM.js'

export default function PowerSwitchVM(osap) {

  // and some bonus power-switching capability... 
  let powerEP = osap.endpoint("powerMirror") 
  let powerQuery = {} 
  // powerEP.addRoute(PK.route(route).sib(6).end())
  // let powerQuery = osap.query(PK.route(route).sib(6).end())

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

  // ------------------------------------------------------ SETUP 
  this.setup = async () => {
    try {
      // find it... 
      let route = (await osap.nr.find("ep_powerSwitches")).route
      // erp-derp, confused route api alert, 
      route = PK.VC2EPRoute(route)
      powerEP.addRoute(route)
      powerQuery = osap.query(route)
    } catch (err) {
      console.error(err)
      throw err 
    }
  }
}