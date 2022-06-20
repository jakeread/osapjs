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

export default class Vertex {
  constructor(parent, indice) {
    this.parent = parent
    this.indice = indice
  }

  name = "vt_unnamed"
  children = [] // all have some children array, not all have children 
  scopeTimeTag = 0 // this property is helpful when looking across graphs, 

  // should be extended... 
  // pls don't forget to item.handled(), or don't if you want it to hang & return next loop 
  destHandler = function (item, ptr) {
    console.log(`default vertex type ${this.type} indice ${this.indice} destHandler`)
    item.handled()
  }

  // ------------------------------------------------------ Stacks 

  // we keep a stack of messages... 
  maxStackLength = TIMES.stackSize
  stack = [[], []]

  // can check availability, we use this for FC 
  stackAvailableSpace = (od) => {
    if (od > 2 || od == undefined) { console.error("bad od arg"); return 0 }
    return (this.maxStackLength - this.stack[od].length)
  }

  awaitStackAvailableSpace = (od, timeout = 1000, count = 1) => {
    return new Promise((resolve, reject) => {
      let to = setTimeout(() => {
        reject('await stack available space timeout')
      }, timeout)
      let check = () => {
        if (this.stackAvailableSpace(od) >= count) {
          clearTimeout(to)
          resolve()
        } else {
          // TODO: curious to watch if this occurs, so: (should delete later)
          console.warn('stack await space...')
          setTimeout(check, 0)
        }
      }
      check()
    })
  }

  // ------------------------------------------------------ Data Ingest 
  // this is the data uptake, 
  handle = (data, od) => {
    // no-not-buffers club, 
    if (!(data instanceof Uint8Array)) {
      console.error(`non-uint8_t ingest at handle, rejecting`)
      return
    } else if (od == null || od > 2) {
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
      for (let i in this.stack[od]) {
        if (this.stack[od][i] == item) {
          this.stack[od].splice(i, 1)
          ok = true
          break;
        }
      }
      if (!ok) console.error("bad stack search") //throw new Error("on handled, item not present")
    }
    this.stack[od].push(item)
    this.requestLoopCycle()
  }

  // handle to kick loops, passes up parent chain to root 
  requestLoopCycle = () => {
    this.parent.requestLoopCycle()
  }

  // ------------------------------------------------------ PING 
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
      this.runningPingID++; this.runningPingID = this.runningPingID & 0b11111111;
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
    this.handle(datagram, VT.STACK_DEST)
  }

  pingResponseHandler = (item, ptr) => {
    // item.data[ptr] = PK.PTR, ptr + 1 == PK.PINGRES 
    let id = TS.readArg(item.data, ptr + 1)
    for (let a = 0; a < this.pingsAwaiting.length; a++) {
      if (this.pingsAwaiting[a].id == id) {
        let pa = this.pingsAwaiting[a]
        pa.res(TIMES.getTimeStamp() - pa.startTime)
        this.pingsAwaiting.splice(a, 1)
      }
    }
    item.handled()
  }

  // ------------------------------------------------------ SCOPE 
  // any vertex can request 'scope' info from some partner, 
  runningScopeID = 11
  scopesAwaiting = []

  scope = async (route, timeTag, ttl = 1000, segSize = 128) => {
    try {
      if (!timeTag){
        console.warn("scope called w/ no timeTag")
        timeTag = 0 
      }
      // maybe a nice API in general is like 
      // (1) wait for outgoing space in the root's origin stack: 
      await this.awaitStackAvailableSpace(VT.STACK_ORIGIN)
      // (2) write a packet, just the scope request, to whatever route, w/ a unique-ish id, 
      let id = this.runningScopeID
      this.runningScopeID++; this.runningScopeID = this.runningScopeID & 0b11111111;
      // payload is just request key, ID, and uint32_t timeTag, 
      let payload = new Uint8Array(6)
      payload[0] = PK.SCOPEREQ; payload[1] = id;
      TS.write('uint32', timeTag, payload, 2)
      // can write a datagram w/ the route & payload, will use default TTL and segSize, 
      let datagram = PK.writeDatagram(route, payload, ttl, segSize)
      // (3) send the packet !
      this.handle(datagram, VT.STACK_ORIGIN)
      // (4) setup to handle the request, associating it w/ this fn  
      // about timeout math: we have a route which has route.length / 2 operations, and each has a ttl of our given ttl, 
      // and we have a round-trip, so absolute maximum time it could take is... that count * that time, 
      return new Promise((resolve, reject) => {
        this.scopesAwaiting.push({
          request: new Uint8Array(datagram),            // copy-in the og request 
          id: id,                                       // it's id 
          timeout: setTimeout(() => {                   // a timeout... 
            reject(`scope timeout`)
          }, route.length * ttl),
          onResponse: function (item, ptr) {            // callback / handler 
            // clear timeout 
            clearTimeout(this.timeout)
            // now we want to resolve this w/ a description of the ...
            // virtual vertex ? vvt ? ffs. 
            let vvt = {}
            vvt.route = route
            vvt.timeTag = timeTag // what we just tagged it with 
            vvt.previousTimeTag = TS.read('uint32', item.data, ptr + 3) // what it replies w/ as previous tag 
            vvt.type = item.data[ptr + 7]
            vvt.indice = TS.read('uint16', item.data, ptr + 8)
            vvt.children = new Array(TS.read('uint16', item.data, ptr + 12))
            vvt.name = TS.read('string', item.data, ptr + 14).value
            resolve(vvt)
          }
        })
      })
    } catch (err) {

    }
  }

  scopeResponseHandler = (item, ptr) => {
    // search for tailing by id...
    let id = TS.readArg(item.data, ptr + 1)
    for(let a = 0; a < this.scopesAwaiting.length; a ++){
      if(this.scopesAwaiting[a].id == id){
        this.scopesAwaiting[a].onResponse(item, ptr)
        this.scopesAwaiting.splice(a, 1)
      }
    }
    item.handled()
  }

  scopeRequestHandler = (item, ptr) => {
    // replying to this thing... we have item.data[ptr] == PK.PTR 
    let id = TS.readArg(item.data, ptr + 1)
    // +1 for the key, +1 for the id, +4 for the time tag, +1 for type, 
    // +2 for own indice, +2 for # siblings, +2 for # children
    // + string name length + 4 counts for string's length
    let payload = new Uint8Array(13 + this.name.length + 4)
    // write the key & id, 
    TS.writeKeyArgPair(payload, 0, PK.SCOPERES, id)
    // to write the rest, we'll wptr +=... starting from 2, 
    let wptr = 2 
    // the time we were last scoped:
    wptr += TS.write('uint32', this.scopeTimeTag, payload, wptr)
    // and read-in the new scope time data: 
    this.scopeTimeTag = TS.read('uint32', item.data, ptr + 2)
    // our type, 
    payload[wptr++] = this.type
    // our own indice, # of siblings, # of children:
    wptr += TS.write('uint16', this.indice, payload, wptr)
    if (this.parent) {
      wptr += TS.write('uint16', this.parent.children.length, payload, wptr)
    } else {
      wptr += TS.write('uint16', 0, payload, wptr)
    }
    wptr += TS.write('uint16', this.children.length, payload, wptr)
    // finally, our name:
    wptr += TS.write('string', this.name, payload, wptr)
    // console.log('scope response generated:', payload, wptr)
    // write the full packet,
    let datagram = PK.writeReply(item.data, payload)
    // we can put this back in the same stack slot, clearing the OG and replacing, 
    item.handled()
    this.handle(datagram, VT.STACK_DEST)
  }
}