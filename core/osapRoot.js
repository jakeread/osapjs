/*
osapRoot.js

trunk osap object in context tree 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import { PK, TS, VT, EP, TIMES } from './ts.js'
import VPort from './vport.js'
import Vertex from './osapVertex.js'
import Module from './osapModule.js'
import Endpoint from './osapEndpoint.js'
import Query from './osapQuery.js'
import { osapLoop } from './osapLoop.js'

// root is also a vertex, yah 
export default class OSAP extends Vertex {
  // yes, but !parent, indice == 0 
  constructor(){
    super(null, 0)
  }

  // ... 
  type = VT.ROOT
  name = "unnamed root"

  // children factories 
  vPort = (name) => {
    let np = new VPort(this, this.children.length)
    if(name) np.name = name 
    this.children.push(np)
    return np
  }
  module = (name) => {
    let md = new Module(this, this.children.length)
    if(name) md.name = name 
    this.children.push(md)
    return md
  }
  endpoint = (name) => {
    let ep = new Endpoint(this, this.children.length)
    if(name) ep.name = name 
    this.children.push(ep)
    return ep
  }

  // see osapEndpoint.js for notes on this fn 
  destHandler = function (data, ptr) {
    ptr += 3 
    switch(data[ptr]){
      case EP.QUERY_RESP:
        // match on queries 
        let id = data[ptr + 1]
        let resolved = false 
        for(let q of this.queries){
          if(!q.queryAwaiting) continue;
          if(q.queryAwaiting.id == id){
            resolved = true 
            clearTimeout(q.queryAwaiting.timeout)
            q.queryAwaiting.resolve(data.slice(ptr + 2))
            q.queryAwaiting = null 
          }
        }
        if(!resolved){
          console.error('on query reply, no matching resolution')
        } 
        // clear always anyways 
        return true 
      default:
        console.error('root recvs data / not query resp')
        return true 
    }
  }

  // query objects **are not children in the tree** they are little software handles 
  // that tx / rx from here 
  runningQueryId = 101 
  getNewQueryId = () => {
    this.runningQueryId ++ 
    if(this.runningQueryId > 255){
      this.runningQueryId = 0 
    }
    return this.runningQueryId
  }
  queries = [] 
  query = (route) => {
    let qr = new Query(this, route)
    this.queries.push(qr)
    return qr 
  }

  // root loop is unique, children's requestLoopCycle() all terminate here, 
  // only schedule once per turn, 
  loopTimer = null 
  requestLoopCycle = () => {
    if(!this.loopTimer) this.loopTimer = setTimeout(this.loop, 0)
  }

  loop = () => {
    //console.warn('lp --------------')
    // cancel old timer & start loop
    this.loopTimer = null 
    osapLoop(this)
  }
} // end OSAP
