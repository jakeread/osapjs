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

import { PK, DK, EP, TS, TIMES } from './ts.js'

export default function Endpoint(osap) {
  // has local data copy 
  this.data = null
  // has outgoing routes, 
  this.routes = []
  // has a position (osap will set)
  this.indice = 0

  // ------------------------ OSAP pushes data in here, 
  this.recieve = (datagram) => {
    throw new Error("this side not really ready in JS")
    this.data = datagram.slice(0)
    this.transmit()
  }

  // recieve needs to -> put data in the store
  // call onData, 
  // and if onData updates it, not transmit after, otherwise, transmit 
  this.onData = (data) => {
    return new Promise((resolve, reject) => {
      reject('onData method not attached')
    })
  }

  // configure outgoing routes 
  // TODO: 
  // path to node & endpoint are separate args here, but we think of them 
  // as one 'route' ... might clarify some of the API (esp. for drawing)
  // if this were consistent: a path can include an 'endpoint' stop, or not,
  // maybe that's not worth your time - make endpoints typed first 
  this.addRoute = (path, endpoint, segsize) => {
    // default segsize if not specified 
    if (!segsize) segsize = 128
    // we can write much of the outgoing datagram once, when we add this:
    let header = new Uint8Array(9)
    header[0] = DK.VMODULE
    header[1] = 0; header[2] = 0; // from vmodule 0 (all zero atm)
    header[3] = this.indice & 255; header[4] = (this.indice >> 8) & 255; // from endpoint us
    header.set(endpoint.subarray(1, 5), 5) // fill vmodule-to / endpoint-to from route info 
    // we store this... somewhat bloated object 
    this.routes.push({
      path: path,         // [pk.portf / b0 / b1 / pk.busf / etc]
      endpoint: endpoint, // [dk.vmodule / module[2] / endpoint[2]]
      header: header,     // header, written above 
      datagram: null,     // datagram, written at send 
      segsize: segsize,
      status: null,       // send state  
      timer: null,        // send state 
      resetState: function () {
        this.timer = null 
        this.send = null 
        this.status = null 
      }
    })
  }

  // ok, ok, awkward, but here's some handles 
  let writeResolve = null
  let writeReject = null
  this.checkStates = () => {
    // so, we return the fn call when everything has resolved, 
    let resCount = 0
    // first, check if everything has some resolution:
    for (let rt of this.routes) {
      if (rt.status != "awaiting rx" && rt.status != "awaiting tx") {
        resCount++
      }
    }
    // is resolved?
    if(resCount >= this.routes.length){
      let ok = true 
      let res = []
      for(let rt of this.routes){
        // add the state, 
        res.push(rt.status)
        clearTimeout(rt.timer)
        rt.resetState()
        if(rt.status != "yacked") ok = false 
      }
      if(ok && writeResolve){
        writeResolve(res)
        writeResolve = null 
        writeReject = null 
      } else if (!ok && writeReject){
        writeReject(res)
        writeResolve = null 
        writeReject = null 
      } else {
        console.warn('attempted resolution w/ no write resolve / write reject')
      }
    }
  }

  // transmit to all routes & await return before resolving, 
  this.write = (datagram) => {
    // 'write' updates the data stored here, lettuce do that first.
    // since these aren't typed yet, datagram should always be a uint8_t array
    // idea: keep underlying data as serialized arrayBuffer in all js?  
    this.data = datagram.slice(0) // the best way to copy an array in js 
    // now send everything, then return 
    return this.transmit()
  }

  this.transmit = () => {
    // and what to do with that case? don't transmit? retransmit & give up on old messages?
    // then how to differentiate others' missing acks? 
    // then, we will check about transmitting everything... 
    // and set flags for routes which we can't transmit on yet (not cts())
    // those will have to get picked up by osap, in the main loop... 
    return new Promise((resolve, reject) => {
      // if one of these is active, this won't be null - and the software is trying 
      // to write faster than connected network endpoints can keep up, 
      if(writeReject){
        reject('previous write call has not resolved')
        return  
      }
      // set callbacks...
      writeResolve = resolve 
      writeReject = reject 
      for (let rt of this.routes) {
        // reset the route state, 
        rt.resetState()
        rt.status = "awaiting tx"
        // write the datagram, 
        let datagram = new Uint8Array(this.data.length + 9)
        datagram.set(rt.header, 0, 9) // header is vmodule from / vmodule to 
        datagram.set(this.data, 9)    // stuff data, 
        rt.datagram = datagram
        // yep, a fn for attempting 
        rt.send = () => {
          osap.send(rt, datagram).then(() => {
            rt.status = "awaiting rx"
          }).catch((err) => {
            if (err == "outgoing vport not cts") {
              rt.status = "retry tx"
              this.checkStates()
            } else {
              rt.error = "tx error"
              this.checkStates()
            }
          })
        }
        // time it out, 
        rt.timer = setTimeout(() => {
          rt.status = "timeout"
          this.checkStates()
        }, TIMES.endpointTransmitTimeout)
        // send it, 
        rt.send()
      }
    })

  }
}