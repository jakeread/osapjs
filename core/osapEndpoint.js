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

let reverseRoute = (route) => {
  console.error(`badness, pls refactor for pk.writeReply`)
}

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

  // has outgoing routes, 
  addRoute = function (route) {
    console.log(`adding route to ep ${this.indice}`, route)
    if (this.maxStackLength <= this.routes.length) {
      console.warn('increasing stack space to match count of routes')
      this.maxStackLength++
    }
    this.routes.push(route)
  }

  // can upd8 how long it takes to to 
  timeoutLength = TIMES.staleTimeout
  setTimeoutLength = (time) => {
    this.timeoutLength = time
  }

  // software data delivery, define per endpoint, 
  // onData handlers can return promises in order to enact flow control,
  onData = function (data) {
    return new Promise((resolve, reject) => {
      console.warn('default endpoint onData')
      resolve()
    })
  }

  // local helper, wraps onData in always-promiseness,
  token = false
  onDataResolver = (data) => {
    let res = this.onData(data)
    if (res instanceof Promise) {   // return user promise, 
      return res
    } else {                      // invent & resolve promise, 
      return new Promise((resolve, reject) => {
        resolve()
      })
    }
  }

  // handles 'dest' keys at endpoints, 
  destHandler = function (item, ptr) {
    // item.data[ptr] == PK.PTR, item.data[ptr + 1] == PK.DEST 
    switch (item.data[ptr + 2]) {
      case EP.SS_ACK:
        { // ack *to us* arriveth, check against awaiting transmits 
          let ackID = item.data[ptr + 3]
          for (let a = 0; a < this.acksAwaiting.length; a++) {
            if (this.acksAwaiting[a].id == ackID) {
              this.acksAwaiting.splice(a, 1)
            }
          }
          if (this.acksAwaiting.length == 0) {
            this.acksResolve()
          }
        }
        item.handled(); break;
      case EP.SS_ACKLESS:
        if (this.token) {
          // packet will wait for res, 
          return
        } else {
          this.token = true
          this.onDataResolver(new Uint8Array(item.data.subarray(ptr + 3))).then(() => {
            // resolution to the promise means data is OK, we accept 
            this.data = new Uint8Array(item.data.subarray(ptr + 3))
            this.token = false
          }).catch((err) => {
            // error / rejection means not our data, donot change internal, but clear for new 
            this.token = false
          })
          item.handled(); break;
        }
      case EP.SS_ACKED:
        if (this.token) {
          // packet will wait for res, 
          return 
        } else {
          this.token = true
          this.onDataResolver(new Uint8Array(item.data.subarray(ptr + 4))).then(() => {
            this.data = new Uint8Array(item.data.subarray(ptr + 4))
            this.token = false
            // payload is just the dest key, ack key & id, id is at ptr + dest + key + id 
            let datagram = PK.writeReply(item.data, new Uint8Array([PK.DEST, EP.SS_ACK, item.data[ptr + 3]]))
            // we... should flowcontrol this, it's awkward, just send it, this is OK in JS 
            this.handle(datagram, VT.STACK_ORIGIN)
          }).catch((err) => {
            this.token = false
          })
          item.handled(); break;
        }
      case EP.QUERY:
        {
          // new payload for reply, keys are dest, query_resp, and ID from incoming, 
          let payload = new Uint8Array(3 + this.data.length)
          payload[0] = PK.DEST; payload[1] = EP.QUERY_RESP; payload[2] = item.data[ptr + 3];
          // write-in data,
          payload.set(this.data, 3)
          // formulate packet, 
          let datagram = PK.writeReply(item.data, payload)
          this.handle(datagram, VT.STACK_ORIGIN)
        }
        item.handled(); break;
      case EP.ROUTE_QUERY:
        {
          // let's see about our route... it should be at 
          let rqid = item.data[ptr + 3]
          let indice = item.data[ptr + 4]
          // make payloads, 
          let payload = {}
          if (this.routes[indice]) {
            let route = this.routes[indice]
            //console.log('has route', route)
            // header len... + route len less 3 (no dest & segsize...), + 3 for 
            // RQRESP, RQID, MODE, LEN
            let repl = new Uint8Array(respRoute.length + route.length - 3 + 4)
            repl.set(respRoute, 0)
            repl[respRoute.length] = EP.ROUTE_RESP
            repl[respRoute.length + 1] = rqid
            // yeah, this is also a dummy: endpoints in JS don't store modes... 
            repl[respRoute.length + 2] = EP.ROUTEMODE_ACKLESS
            repl[respRoute.length + 3] = route.length - 3
            repl.set(route.slice(0, -3), respRoute.length + 4)
            this.handle(repl, VT.STACK_ORIGIN)
          } else {
            // + 3 RQRESP, RQID, LEN 
            let repl = new Uint8Array(respRoute.length + 3)
            repl.set(respRoute, 0)
            repl[respRoute.length] = EP.ROUTE_RESP
            repl[respRoute.length + 1] = rqid
            repl[respRoute.length + 2] = 0 // for does-not-exist here, 
            this.handle(repl, VT.STACK_ORIGIN)
          }
          let datagram = PK.writeReply(item.data, payload)
          item.handled()
          this.handle(datagram, VT.STACK_DEST)
        }
      case EP.ROUTE_SET:
        if (this.stackAvailableSpace(VT.STACK_ORIGIN)) {
          // uuuuh 
          let rqid = data[ptr + 1]
          let respRoute = reverseRoute(data)
          // just do it blind, eh?
          let newRoute = data.slice(ptr + 4)
          // stick the tail elements in, big bad, this whole subsystem ignores segsizes...
          let route = new Uint8Array(newRoute.length + 3)
          route.set(newRoute, 0)
          route[newRoute.length] = PK.DEST
          route[newRoute.length + 1] = 0; route[newRoute.length + 2] = 2; // 512 segsize... 
          console.log('new route...', route)
          this.addRoute(route)
          // a reply is kind, 
          let repl = new Uint8Array(respRoute.length + 3)
          repl.set(respRoute, 0)
          repl[respRoute.length] = EP.ROUTE_SET_RESP
          repl[respRoute.length + 1] = rqid
          repl[respRoute.length + 2] = 1 // 1: ok, 0: badness 
          this.handle(repl, VT.STACK_ORIGIN)
          return true
        } else {
          return false
        }
      case EP.ROUTE_RM:
        if (this.stackAvailableSpace(VT.STACK_ORIGIN)) {
          // uuuuh 
          let rqid = data[ptr + 1]
          let respRoute = reverseRoute(data)
          let indice = data[ptr + 2]
          // a reply is kind, 
          let repl = new Uint8Array(respRoute.length + 3)
          repl.set(respRoute, 0)
          repl[respRoute.length] = EP.ROUTE_RM_RESP
          repl[respRoute.length + 1] = rqid
          // now, if we can rm, do:
          if (this.routes[indice]) {
            this.routes.splice(indice, 1)
            repl[respRoute.length + 2] = 1 // 1: ok, 0: badness   
          } else {
            repl[respRoute.length + 2] = 0
          }
          this.handle(repl, VT.STACK_ORIGIN)
          return true
        } else {
          return false
        }
      case EP.QUERY_RESP:
        // query response, 
        console.error('query resp to endpoint, should go to root')
        return true
        break;
      default:
        // not recognized: resolving here will cause pck to clear above 
        console.error(`nonrec endpoint key at ep ${this.indice}`)
        return true
    }
  }

  runningAckID = 68
  acksAwaiting = []
  acksResolve = null

  // this could be smarter, since we already have this acksResolve() state 
  awaitAllAcks = (timeout = this.timeoutLength) => {
    return new Promise((resolve, reject) => {
      let startTime = TIMES.getTimeStamp()
      let check = () => {
        if (this.acksAwaiting.length == 0) {
          resolve()
        } else if (TIMES.getTimeStamp() - startTime > timeout) {
          reject(`awaitAllAcks timeout`)
        } else {
          setTimeout(check, 0)
        }
      }
      check()
    })
  }

  // transmit to all routes & await return before resolving, 
  write = async (data, mode = "ackless") => {
    try {
      // console.warn(`endpoint ${this.indice} writes ${mode}`)
      // it's the uint8-s only club again, 
      if (!(data instanceof Uint8Array)) throw new Error(`non-uint8_t write at endpoint, rejecting`);
      // otherwise keep that data, 
      this.data = data
      // now wait for clear space, we need as many slots open as we have routes to write to, 
      await this.awaitStackAvailableSpace(VT.STACK_ORIGIN, this.timeoutLength, this.routes.length)
      // now we can write our datagrams, yeah ?
      if (mode == "ackless") {
        for (let route of this.routes) {
          // this is data length + 1 (DEST) + 1 (EP_SSEG_ACKLESS)
          let payload = new Uint8Array(this.data.length + 2)
          payload[0] = PK.DEST
          payload[1] = EP.SS_ACKLESS
          payload.set(this.data, 2)
          // the whole gram, and uptake... 
          let datagram = PK.writeDatagram(route, payload)
          this.handle(datagram, VT.STACK_ORIGIN)
        } // that's it, ackless write is done, async will complete, 
      } else if (mode == "acked") {
        // wait to have zero previous acks awaiting... right ? 
        await this.awaitAllAcks()
        // now write 'em 
        for (let route of this.routes) {
          // data len + 1 (DEST) + 1 (EP_SSEG_ACKED) + 1 (ID)
          let payload = new Uint8Array(this.data.length + 3)
          payload[0] = PK.DEST
          payload[1] = EP.SS_ACKED
          let id = this.runningAckID
          this.runningAckID++; this.runningAckID = this.runningAckID & 0b11111111;
          payload[2] = id
          payload.set(this.data, 3)
          let datagram = PK.writeDatagram(route, payload)
          this.acksAwaiting.push({
            id: id,
          })
          this.handle(datagram, VT.STACK_ORIGIN)
        }
        // end conditions: we return a promise, rejecting on a timeout, resolving when all acks come back, 
        return new Promise((resolve, reject) => {
          let timeout = setTimeout(() => {
            reject(`write to ${this.name} times out w/ ${this.acksAwaiting.length} acks still awaiting`)
          }, this.timeoutLength)
          this.acksResolve = () => {
            clearTimeout(timeout)
            this.acksResolve = null
            resolve()
          }
        })
      } else {
        throw new Error(`endpoint ${this.name} written to w/ bad mode argument ${mode}, should be "acked" or "ackless"`)
      }
    } catch (err) {
      throw err
    }
  } // end write 

} // end endpoint 