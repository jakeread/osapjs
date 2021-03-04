/*
osap-endpoint.js

prototype software entry point / network endpoint for osap system

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, TS, TIMES } from './ts.js'

export default function Endpoint(parent) {
  // has local data copy 
  this.data = new Uint8Array(0)
  // has outgoing routes, 
  this.routes = []
  // has a position (parent will set), and type 
  this.indice = undefined
  this.type = PK.DOWN_OBJ.KEY
  // has a write timeout length,
  this.timeoutLength = TIMES.endpointTransmitTimeout
  this.setTimeoutLength = (millis) => {
    this.timeoutLength = millis
  }

  // parent checks 
  this.clear = () => {
    return true
  }

  this.handle = (buffer) => {
    console.log("ep rx")
    PK.logPacket(buffer)
  }

  // ------------------------ add a route, using TS.route().[...].end(seg) 
  this.addRoute = (route) => {
    // check that 1st escape is up-obj, no other way out of this thing
    if(route.path[0] != PK.UP_OBJ.KEY){
      TS.logPacket(route.path)
      throw new Error('no escape from an endpoint save for up-obj')
    }
    this.routes.push(route)
  }

  // transmit to all routes & await return before resolving, 
  this.write = (datagram) => {
    // 'write' updates the data stored here, lettuce do that first.
    // the best way to copy an array in js (source: internet) is:
    this.data = datagram.slice(0)
    // now send everything, then return 
    return this.transmit()
  }

  let MSGSTATE = {
    AWAIT: 0,
    TRANSMITTED: 1,
    TIMEOUT: 2,
    ACKED: 3
  }

  let awaiting = false 

  this.transmit = () => {
    // are we already awaiting response from some?
    if(awaiting){
      reject('already awaiting')
      return 
    }
    // now we transmit each of these and determine if each has been cleared, 
    return new Promise((resolve, reject) => {
      // tries transmitting data to all defined routes 
      // write an output message for each route, 
      let msgs = []
      let now = TIMES.getTimeStamp()

      // check when handled, 
      let check = () => {
        let resolutions = 0 
        for (let msg of msgs) {
          switch(msg.status){
            case MSGSTATE.AWAIT:
              parent.handle(msg, 3) // try handle, 
              break;
            case MSGSTATE.TRANSMITTED:
            case MSGSTATE.TIMEOUT:
              resolutions ++ 
              break;
          }
        }
        if(resolutions == msgs.length){
          awaiting = false
          resolve("all TXd or timed out")
        } else {
          // drive parent's loop to handle... 
          console.log('endpoint checks again')
          setTimeout(check, 0)
        }
      }

      // write outgoing msgs for each route, 
      for (let route of this.routes) {
        // write the gram: 1st write in departure, which is this object indice
        // that's 3 bytes for the departure, 1 for ptr, and 1 for dest key
        // ... we are flipping the 'up-obj' output code for our reciprocal return path 
        // which is the down-obj, to our indice 
        let datagram = new Uint8Array(route.path.length + 2 + this.data.length)
        datagram[0] = PK.DOWN_OBJ.KEY
        TS.write('uint16', this.indice, datagram, 1)
        // the pointer afterwards, 
        datagram[3] = PK.PTR
        // now copy-in remainder of route,
        datagram.set(route.path.subarray(3), 4)
        // the end / dest key
        datagram[route.path.length + 1] = PK.DEST
        // and copy-in the data store 
        datagram.set(this.data, 2 + route.path.length)
        // make a message object, this is akin to arrival at a vport 
        let msg = {
          data: datagram,
          origin: this,
          arrivalTime: now,
          status: MSGSTATE.AWAIT,
          handled: function () {
            this.status = MSGSTATE.TRANSMITTED
          }
        }
        // set a timeout for the msg 
        setTimeout(() => { msg.status == MSGSTATE.TIMEOUT }, this.timeoutLength)
        // add to list of msgs 
        msgs.push(msg)
      }
      
      // run first check, 
      check()
    })
  }
}