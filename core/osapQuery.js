/*
osapQuery.js

resolves remote data for local code 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, EP, TIMES } from './ts.js'
import Vertex from './osapVertex.js'

export default class Query extends Vertex {
  constructor(parent, indice, route, retries) {
    super(parent, indice)
    this.route = route
    this.maxRetries = retries 
  }
  
  // ---------------------------------- Some State, as a Treat 

  queryAwaiting = null 

  // ---------------------------------- Reply Catch Side 

  destHandler = function (data, ptr) {
    //console.log(data, ptr, data[ptr])
    //                 data[ptr]
    // [route:n][ptr:1][dest:1][segsize:2][application]
    ptr += 3
    switch (data[ptr]) {
      case EP.QUERY_RESP:
        // match & bail 
        if(this.queryAwaiting.id == data[ptr + 1]){
          clearTimeout(this.queryAwaiting.timeout)
          for(let res of this.queryAwaiting.resolutions){
            res(data.slice(ptr + 2))
          }
          this.queryAwaiting = null 
        } else {
          console.error('on query reply, no matching resolution')
        }
        // clear always anyways 
        return true
      default:
        console.error('root recvs data / not query resp')
        return true
    }
  }

  // ---------------------------------- Issuing Side 

  runningQueryId = 101
  getNewQueryId = () => {
    this.runningQueryId++
    if (this.runningQueryId > 255) {
      this.runningQueryId = 0
    }
    return this.runningQueryId
  }

  pull = () => {
    return new Promise((resolve, reject) => {
      if (this.queryAwaiting) {
        //console.warn(`already awaiting on this line from '${this.parent.name}' adding 2nd response`)
        //console.log(this.route)
        this.queryAwaiting.resolutions.push(resolve)
      } else {
        let queryId = this.getNewQueryId()
        let req = new Uint8Array(this.route.length + 2)
        req.set(this.route, 0)
        req[this.route.length] = EP.QUERY
        req[this.route.length + 1] = queryId
        this.queryAwaiting = {
          id: queryId,
          resolutions: [resolve],
          retries: 0,
          timeoutFn: () => {
            if(this.queryAwaiting.retries >= this.maxRetries){
              this.queryAwaiting = null
              reject(`query timeout after ${this.maxRetries} retries`)  
            } else {
              console.warn(`query retry`)
              this.queryAwaiting.retries ++ 
              this.handle(req, 0)
              this.queryAwaiting.timeout = setTimeout(this.queryAwaiting.timeoutFn, TIMES.staleTimeout)
            }
          }
        } // end query obj 
        // set 1st timeout, 
        this.queryAwaiting.timeout = setTimeout(this.queryAwaiting.timeoutFn,TIMES.staleTimeout)
        // parent handles,
        //console.log('query', req)
        this.handle(req, 0)
      }
    })
  }
}