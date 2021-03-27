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

import { PK, TS, VT, EP, TIMES } from './ts.js'
import Vertex from './osapVertex.js'
import { reverseRoute } from './osapLoop.js'

export default class Endpoint extends Vertex {
  constructor(parent, indice) {
    super(parent, indice)
  }

  /* to implement */
  // write this.onData(), returning promise when data is cleared out 
  // use this.transmit(bytes), 
  // use this.addRoute(route) to add routes 

  // endpoint addnl'y has outgoing routes, 
  routes = []
  type = VT.ENDPOINT
  name = "unnamed endpoint"

  // and has a local data cache 
  data = new Uint8Array(0)
  token = false

  // has outgoing routes, 
  addRoute = function (route) {
    console.log('adding route', route)
    if (this.maxStackLength <= this.routes.length) {
      console.warn('increasing stack space to match count of routes')
      this.maxStackLength++
    }
    this.routes.push(route)
  }

  // software data delivery, define per endpoint, should return promise 
  onData = function (data) {
    return new Promise((resolve, reject) => {
      console.warn('default onData')
      resolve()
    })
  }

  // here data->item[ptr] == PK_DEST,
  // [ptr + 1, ptr + 2] = segsize, 
  // here, resolve() or reject() both pass up, thru vt.dest to clear for new input 
  destHandler = function (data, ptr) {
    // console.log('endpoint dest handler')
    // PK.logPacket(data)
    // console.log(ptr, data[ptr])
    ptr += 3;
    switch (data[ptr]) {
      case EP.SS_ACK:
        {
          // the ack arriveth,
          let ackId = data[ptr + 1]
          let spliced = false
          for (let a = 0; a < this.acksAwaiting.length; a++) {
            if (this.acksAwaiting[a].id == ackId) {
              spliced = true
              clearTimeout(this.acksAwaiting[a].timeout)
              this.acksAwaiting.splice(a, 1)
            }
          }
          if (!spliced) { console.error("on ack, no ID awaiting..."); PK.logPacket(data); return true; }
          if (this.acksAwaiting.length == 0) {
            console.warn('res all acks')
            this.acksResolve()
            this.acksResolve = null
          }
        }
        return true
        break;
      case EP.SS_ACKLESS:
        // if already occupied, push to next turn 
        if (this.token) {
          return false
        } else {
          //console.warn('data -> endpoint, ackless')
          this.onData(data.slice(ptr + 2)).then(() => {
            // resolution to the promise means data is OK, we accept 
            this.data = data.slice(ptr + 2)
            this.token = false
          }).catch((err) => {
            // error / rejection means not our data, donot change internal, but clear for new 
            this.token = false
          })
          return true
        }
        break;
      case EP.SS_ACKED:
        if (this.token) {
          return false
        } else {
          //console.warn('data -> endpoint, ack required')
          this.onData(data.slice(ptr + 2)).then(() => {
            this.data = data.slice(ptr + 2)
            this.token = false
            // push the ack into the stack... not totally able to guarantee there's enough space here atm, but js arrays, so... 
            let route = reverseRoute(data)
            let ack = new Uint8Array(route.length + 2)
            ack.set(route, 0)
            ack[route.length] = EP.SS_ACK;
            ack[route.length + 1] = data[ptr + 1];
            this.handle(ack, 0)
          }).catch((err) => {
            this.token = false
          })
        }
        return true
        break;
      case EP.QUERY:
        console.warn('query reqd')
        // query request, 
        resolve()
        break;
      case EP.QUERY_RESP:
        // query response, 
        console.warn('query resp to endpoint, should go to root')
        resolve()
        break;
      default:
        // not recognized: resolving here will cause pck to clear above 
        resolve()
    }
  }

  runningAckId = 10
  getNewAckId = () => {
    this.runningAckId++
    if (this.runningAckId > 255) {
      this.runningAckId = 0
    }
    return this.runningAckId
  }
  acksAwaiting = []
  acksResolve = null

  // transmit to all routes & await return before resolving, 
  write = function (data, mode = "ackless") {
    // then, onData modification... and should modify loop similar to embedded 
    // keep the cache always: 
    this.data = data
    // returning promise, clears based on mode / network 
    return new Promise((resolve, reject) => {
      if (this.maxStackLength - this.stack[VT.STACK_ORIGIN].length < this.routes.length) {
        reject('write to full stack')
        return
      }
      if (mode == "ackless") {
        for (let route of this.routes) {
          // we want to push elements into the stack, 
          let datagram = new Uint8Array(route.length + 1 + this.data.length)
          datagram.set(route, 0)
          datagram[route.length] = EP.SS_ACKLESS
          datagram.set(this.data, route.length + 1)
          console.log(datagram)
          // this is the universal vertex data uptake, '0' for origin stack, 
          this.handle(datagram, 0)
        }
        // and we can check... when the stack will be clear to write again, 
        let resolved = false
        let rejected = false
        let check = () => {
          if (this.maxStackLength - this.stack[VT.STACK_ORIGIN].length >= this.routes.length) {
            resolved = true
            if (!rejected) resolve()
          } else {
            setTimeout(check, 0) // check next cycle, 
          }
        }
        check()
        // set a timeout, 
        setTimeout(() => {
          rejected = true
          if (!resolved) reject('timeout')
        }, TIMES.staleTimeout)
      } else if (mode == "acked") {
        if (this.acksAwaiting.length > 0) {
          reject("on write, still awaiting previous acks")
        }
        for (let route of this.routes) {
          let ackId = this.getNewAckId()
          let datagram = new Uint8Array(route.length + 2 + this.data.length)
          datagram.set(route, 0)
          datagram[route.length] = EP.SS_ACKED
          datagram[route.length + 1] = ackId;
          datagram.set(this.data, route.length + 2)
          //console.log(datagram)
          // push it to acks awaiting, 
          this.acksAwaiting.push({
            id: ackId,
            timeout: setTimeout(() => {
              this.acksAwaiting.length = 0 
              reject('timeout')
            }, TIMES.staleTimeout)
          });
          this.handle(datagram, 0)
        }
        // setup for on-all-acks to clear this promise, 
        this.acksResolve = resolve
      } else {
        reject("bad mode at ep.write(), use 'ackless' or 'acked'")
      }
    }) // end write promise 
  }// end write 

} // end endpoint 