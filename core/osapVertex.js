/*
osapVertex.js

base vertex in osap graph 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, VT, TIMES, TS } from './ts.js'
import { reverseRoute } from './osapLoop.js'

export default class Vertex {
  constructor(parent, indice) {
    this.parent = parent
    this.indice = indice
  }

  name = "vt_unnamed"
  children = [] // all have some children array, not all have children 
  scopeTimeTag = 0 // this property is helpful when looking across graphs, 

  // return true when message flushes / is OK / handled, 
  // return false if we want this to bother again on next main loop 
  // i.e. endpoint types extend this to disambiguate acks / messages etc, 
  destHandler = function (item, ptr) {
    console.log(`default vertex type ${this.type} indice ${this.indice} destHandler`)
    return true 
  }

  // for *scope* keys:
  scopeRequestHandler = function(item, ptr){
    // gener8 response, in-place 
    // 1st we reverse the route:
    // to note: reverse route assumes we have the DEST key & segsize at the tail...
    let rr = reverseRoute(item.data)
    // response is length of og route (where ptr is)
    // +1 for the key, +1 for the id, +4 for the time tag, +1 for type, 
    // +2 for own indice, +2 for # siblings, +2 for # children
    // + string name length +4 counts for string's length
    let resp = new Uint8Array(ptr + 13 + this.name.length + 4)
    resp.set(rr.subarray(0, ptr), 0)
    let wptr = ptr // make new write pointer, keep og ptr position 
    // ptr is at the end of the route, now we replace the REQ with a RES key,
    resp[wptr ++] = PK.SCOPE_RES.KEY 
    // the ID from the OG pckt,
    resp[wptr ++] = item.data[ptr + 1]
    // the time we were last scoped:
    wptr += TS.write('uint32', this.scopeTimeTag, resp, wptr)
    // and read-in the new scope time data: 
    this.scopeTimeTag = TS.read('uint32', item.data, ptr + 2)
    // our type, 
    resp[wptr ++] = this.type
    // our own indice, # of siblings, # of children:
    wptr += TS.write('uint16', this.indice, resp, wptr)
    if(this.parent){
      wptr += TS.write('uint16', this.parent.children.length, resp, wptr)
    } else {
      wptr += TS.write('uint16', 0, resp, wptr)
    }
    wptr += TS.write('uint16', this.children.length, resp, wptr)
    // finally, our name:
    wptr += TS.write('string', this.name, resp, wptr)
    //console.log('scope response generated:', resp, wptr)
    // now we can reset this item in-place, all js dirty like:
    item.data = resp 
    item.arrivalTime = TIMES.getTimeStamp()
    // and request that OSAP handle it at some point, 
    this.requestLoopCycle()
  }

  scopeResponseHandler = function(item, ptr){
    console.error("recieved scope response to default vertex handler, bailing")
    PK.logPacket(item.data)
    item.handled()
  }

  // we keep a stack of messages... 
  maxStackLength = TIMES.stackSize
  stack = [[],[]]

  // can check availability, we use this for FC 
  stackAvailableSpace = (od) => {
    if(od > 2 || od == undefined) { console.error("bad od arg"); return 0 }
    return (this.maxStackLength - this.stack[od].length)
  }

  awaitStackAvailableSpace = (od, timeout = 1000) => {
    return new Promise((resolve, reject) => {
      let to = setTimeout(() => {
        reject('await stack available space timeout')
      }, timeout)
      let check = () => {
        if(this.stackAvailableSpace(od)){
          clearTimeout(to)
          resolve()
        } else {
          // TODO: curious to watch if this occurs, so: (should delete later)
          console.warn('stack await space...')
          setTimeout(check, 10)
        }
      }
      check()
    })
  }

  // ---------------------------------- PING 
  // any vertex can issue a ping to a route...
  runningPingID = 42
  pingsAwaiting = [] 

  ping = async (route, ttl = 1000, segSize = 128) => {
    try {
      // record ping start time, 
      let startTime = TIMES.getTimeStamp()
      await this.awaitStackAvailableSpace(VT.STACK_ORIGIN)
      // track an id & increment / wrap tracker,
      let id = this.runningPingID
      this.runningPingID ++; this.runningPingID = this.runningPingID & 0b11111111;
      // payload is just the request & its id, 
      let payload = new Uint8Array([PK.PINGREQ, id])
      // write a 'gram from that, then have vertex ingest it, 
      let datagram = PK.writeDatagram(route, payload, ttl, segSize)
      this.handle(datagram, VT.STACK_ORIGIN) 
      // resolve when the ping comes back, 
      return new Promise((resolve, reject) => {
        this.pingsAwaiting.push({
          startTime: startTime,
          res: resolve,
          id: id,
        })
        setTimeout(() => {
          reject(`ping timed out after 5s`)
        }, 5000)
      })
    } catch (err) {
      throw err 
    }
  }

  pingRequestHandler = (item, ptr) => {
    // item.data[ptr] == PK.PTR 
    // we want to ack this... basically without modifying anything,
    let id = TS.readArg(item.data, ptr + 1)
    let payload = new Uint8Array(2)
    TS.writeKeyArgPair(payload, 0, PK.PINGRES, id)
    let datagram = PK.writeReply(item.data, payload)
    // we'll ack "in place" by rm-ing this item from the destination stack & then replacing it, 
    // no checks this way: pings and scope are always answered, even if i.e. single-stack endpoint
    // is on an every-loop-update, etc... 
    item.handled()
    //PK.logPacket(datagram)
    //console.log(item.vt.name)
    item.vt.handle(datagram, VT.STACK_DEST)
  }

  pingResponseHandler = (item, ptr) => {
    // item.data[ptr] = PK.PTR, ptr + 1 == PK.PINGRES 
    let id = TS.readArg(item.data, ptr + 1)
    for(let a = 0; a < this.pingsAwaiting.length; a ++){
      if(this.pingsAwaiting[a].id == id){
        let pa = this.pingsAwaiting[a]
        pa.res(TIMES.getTimeStamp() - pa.startTime)
        this.pingsAwaiting.splice(a, 1)
      }
    }
  }

  // ---------------------------------- Data Ingest 
  // this is the data uptake, 
  handle = (data, od) => {
    // no-not-buffers club, 
    if(!(data instanceof Uint8Array)){
      console.error(`non-uint8_t ingest at handle, rejecting`)
      return
    } else if(od == null || od > 2){
      console.error(`bad od argument ${od} at handle`)
      return
    }
    let item = {}
    item.data = new Uint8Array(data)                  // copy in, old will be gc 
    item.arrivalTime = TIMES.getTimeStamp()           // track arrival time 
    item.timeToLive = TS.read('uint16', item.data, 0) // track TTL, 
    item.vt = this                                    // handle to us, 
    item.od = od                                      // which stack... 
    item.handled = () => {
      //console.warn(`handled from ${od} stack at ${this.indice}`)
      let ok = false 
      for(let i in this.stack[od]){
        if(this.stack[od][i] == item){
          this.stack[od].splice(i, 1)
          ok = true 
          break;
        }
      }
      if(!ok) console.error("bad stack search") //throw new Error("on handled, item not present")
    }
    this.stack[od].push(item)
    this.requestLoopCycle()
  }

  // handle to kick loops, passes up parent chain to root 
  requestLoopCycle = () => {
    this.parent.requestLoopCycle()
  }

}