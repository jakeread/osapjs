/*
vport.js

virtual port, for osap

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, EP } from './ts.js'

let getTimeStamp = null

if (typeof process === 'object') {
  const { PerformanceObserver, performance } = require('perf_hooks')
  getTimeStamp = () => {
    return performance.now()
  }
} else {
  getTimeStamp = () => {
    return performance.now()
  }
}

export default function VPort(sys) {
  /* --------- internal to VPort instance (implementation writes) -------- */
  // properies 
  this.name = 'unnamed vPort'
  this.description = 'undescribed vPort'
  this.portTypeKey = EP.PORTTYPEKEY.DUPLEX // we are p2p
  this.maxSegLength = 128 // default minimum 
  this.maxAddresses = 1   // property exists for busses, possible # of addrs reached on the other end 

  // buffer of receive packets 
  this.rxbuffer = []
  let lastPulled = 0 // last pckt served 
  this.read = () => {
    if(this.rxbuffer.length > 0){
      let pck = this.rxbuffer[0]
      // has pck.data (the buffer) and pck.arrivalTime 
      pck.vp = this 
      return pck 
    } else {
      return false
    }
  }

  // init, if you want one
  this.init = () => { }
  // loop, same, more likely events 
  this.loop = () => { }
  // return status, override in your port implementation 
  this.status = () => { return EP.PORTSTATUS.CLOSED }

  // fire this code when your port receive a packet 
  this.receive = (buffer) => {
    // would pull rcrxb here 
    // adds to the buffer, 
    this.rxbuffer.push({
      arrivalTime: sys.getTimeStamp(),
      data: buffer
    })
    // has osap run the packet scan 
    sys.onVPortReceive(this)
  }

  // implemented at vport instance 
  this.send = (buffer) => { throw new Error('no vport send fn') }

  // optional hooks to phy to open / shut drivers 
  // implemented at vport instance, if possible 
  this.requestOpen = () => { }
  this.requestClose = () => { }

  /* -------------------- internal to VPort parent ---------------- */
  // osap is done with this packet, rm from the buffer 
  this.clear = () => {
    // TODO: should clear a particular packet, at the moment this.read() just delivers the 0th, so:
    this.rxbuffer.splice(0, 1)
  }

  // osap checks if we are clear to send,
  this.cts = () => {
    if (this.status() == EP.PORTSTATUS.OPEN) {
      // would return based on rcrxb here 
      return true
    } else {
      return false
    }
  }

  // akward, but collecting our own-indice from system,
  // can re-write later to go faster / use cached info
  this.ownIndice = () => {
    // what's my # ?
    let indice = null
    for (let i = 0; i < sys.vPorts.length; i++) {
      if (sys.vPorts[i] === this) {
        indice = i
      }
    }
    if (indice == null) throw new Error('vPort nc from sys, wyd?')
    return indice
  }

} // end vPort def
