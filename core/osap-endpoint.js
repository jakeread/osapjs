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
  this.addRoute = (path, endpoint, segsize) => {
    console.error("HERE: writing route rep w/ endpoint, segsize as byte array")
    // do option to not-write segsize, use default minimum 128
    // pick some byte-level route representation: this will be underlying rep in 
    // all softwares / what is reported to tool 
    // then do from here, this.write does this.transmit() does packet forming, tx 
    // then tx, don't bother with too much other state, listen for ack from embedded, print it 
    this.routes.push({
      path: path,
      segsize: segsize,
      awaitingAck: false,
      timer: null,
      resetState: function () {
        this.sendComplete = false
        this.retrySend = false      // flag for outgoing-port-not-cts retries 
        this.yacked = false 
        this.error = null
        this.timer = null 
      }
    })
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
    // then, we will check about transmitting everything... 
    // and set flags for routes which we can't transmit on yet (not cts())
    // those will have to get picked up by osap, in the main loop... 
    return new Promise((resolve, reject) => {
      for (let rt of this.routes) {
        // reset the route state, 
        rt.resetState()
        // try to ship it, 
        osap.send(rt, this.data).then(() => {
          rt.sendComplete = true
        }).catch((err) => {
          console.error(err)
          if(err == "outgoing vport not cts"){
            rt.retrySend = true 
          } else {
            rt.error = "transmit error"
          }
        })
        // time it out, 
        rt.timer = setTimeout(()=>{
          rt.error = "timeout"
        }, TIMES.endpointTransmitTimeout)
      }
    })

  }
}