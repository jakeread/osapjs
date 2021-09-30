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

import { PK, TIMES, TS } from './ts.js'
import { reverseRoute } from './osapLoop.js'

export default class Vertex {
  /* to implement */
  // write this.onData(), returning promise when data is cleared out 
  // use this.transmit(bytes), 
  // use this.addRoute(route) to add routes 

  constructor(parent, indice) {
    this.parent = parent
    this.indice = indice
  }

  name = "unnamed vertex"
  children = [] // all have some children array, not all have children 

  // return true when message flushes / is OK / handled, 
  // return false if we want this to bother again on next main loop 
  // i.e. endpoint types extend this to disambiguate acks / messages etc, 
  destHandler = function (data, ptr) {
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
    // +1 for the key, +1 for the id, +1 for type,
    // +2 for own indice, +2 for # siblings, +2 for # children
    // + string name length +4 counts for string's length
    let resp = new Uint8Array(ptr + 9 + this.name.length + 4)
    resp.set(rr.subarray(0, ptr), 0)
    let wptr = ptr // make new write pointer, keep og ptr position 
    // ptr is at the end of the route, now we replace the REQ with a RES key,
    resp[wptr ++] = PK.SCOPE_RES.KEY 
    // the ID from the OG pckt,
    resp[wptr ++] = item.data[ptr + 1]
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

  // this is the data uptake, 
  handle = (data, od) => {
    if(od == null || od > 2) console.error(`bad od argument ${od} at handle`)
    let item = {}
    item.data = data.slice() // copy in, old will be gc 
    item.arrivalTime = TIMES.getTimeStamp()
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
  loopTimer = null 
  requestLoopCycle = () => {
    this.parent.requestLoopCycle()
  }

}