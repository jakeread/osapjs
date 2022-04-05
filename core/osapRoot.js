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
import QueryMSeg from './osapQueryMSeg.js'
import { osapLoop } from './osapLoop.js'
import NetRunner from './netRunner.js'

// root is also a vertex, yah 
export default class OSAP extends Vertex {
  // yes, but !parent, indice == 0 
  constructor(name = "unnamed root") {
    super(null, 0)
    this.name = name 
  }

  // ... 
  type = VT.ROOT

  // children factories 
  vPort = (name) => {
    let np = new VPort(this, this.children.length)
    if (name) np.name = name
    this.children.push(np)
    return np
  }
  module = (name) => {
    let md = new Module(this, this.children.length)
    if (name) md.name = name
    this.children.push(md)
    return md
  }
  endpoint = (name) => {
    let ep = new Endpoint(this, this.children.length)
    if (name) ep.name = name
    this.children.push(ep)
    return ep
  }
  query = (route, retries = 2) => {
    let qr = new Query(this, this.children.length, route, retries)
    qr.name = `query_${this.children.length}`
    this.children.push(qr)
    return qr 
  }
  queryMSeg = (route, retries = 2) => {
    let msqr = new QueryMSeg(this, this.children.length, route, retries)
    msqr.name = `queryMSeg_${this.children.length}`
    this.children.push(msqr)
    return msqr 
  }

  /*
  queries = []
  query = (route, retries = 2) => {
    let qr = new Query(this, route, retries)
    this.queries.push(qr)
    return qr
  }
  queryMSegs = []
  queryMSeg = (route) => {
    let msqr = new QueryMSeg(this, route)
    this.queryMSegs.push(msqr)
    return msqr 
  }
  */

  // root loop is unique, children's requestLoopCycle() all terminate here, 
  // only schedule once per turn, 
  loopTimer = null
  requestLoopCycle = () => {
    if (!this.loopTimer) this.loopTimer = setTimeout(this.loop, 0)
  }

  loop = () => {
    //console.warn('lp --------------')
    // cancel old timer & start loop
    this.loopTimer = null
    osapLoop(this)
  }

  // graph search tool;
  netRunner = new NetRunner(this)
  // root will want responses to scope queries, so 
  scopeResponseHandler = this.netRunner.scopeResponseHandler

} // end OSAP
