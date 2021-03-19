/*
osap-vertex.js

base vertex in osap graph 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { TIMES } from './ts.js'

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

  // local data store / freshness 
  data = new Uint8Array(0)
  token = false
  occupied = function () {
    return this.token
  }

  dest = function (data, ptr) {
    // now we have this unhandled data, 
    this.token = true
    // it's the whole packet, copied out 
    let buffer = data.slice(0)
    // we ask handler to clear, 
    this.onData(buffer, ptr).then(() => {
      // if it resolves, we are open again, and data copies in 
      this.data = buffer
      this.token = false
    }).catch((err) => {
      // otherwise we have rejected it, data doesn't change 
      // but are still open again 
      this.token = false
    })
  }

  onData = function (data, ptr) {
    console.log(`default vertex ${this.type} onData`)
    return new Promise((resolve, reject) => {
      resolve()
    })
  }

  // we keep a stack of messages... 
  maxStackLength = TIMES.stackSize
  stack = [[],[]]

  // can check availability 
  stackAvailableSpace = (od) => {
    if(od > 2 || od == undefined) throw new Error("bad od arg")
    return (this.maxStackLength - this.stack[od].length)
  }

  // this is the data uptake, 
  handle = (data, od) => {
    if(od == null || od > 2) throw new Error(`bad od argument ${od} at handle`)
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