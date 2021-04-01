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

  // return true when message flushes / is OK / handled, 
  // return false if we want this to bother again on next main loop 
  // i.e. endpoint types extend this to disambiguate acks / messages etc, 
  destHandler = function (data, ptr) {
    console.log(`default vertex type ${this.type} indice ${this.indice} destHandler`)
    return true 
  }

  // we keep a stack of messages... 
  maxStackLength = TIMES.stackSize
  stack = [[],[]]

  // can check availability 
  stackAvailableSpace = (od) => {
    if(od > 2 || od == undefined) console.error("bad od arg")
    return (this.maxStackLength - this.stack[od].length)
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