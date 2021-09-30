/*
netRunner.js

graph search routines, in JS, for OSAP systems 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, VT, TIMES } from './ts.js'

export default function NetRunner(osap) {
  // runs the whole situation 
  this.sweep = async () => {
    // ohboy, ok: 
  }

  // pings a particular route, for SCOPE info, resolving when 
  // info comes back: simple enough:
  this.ping = async (route) => {
    try {
      // maybe a nice API in general is like 
      // (1) set a timeout, 
      let to = setTimeout(() => {
        throw new Error("netRunner ping times out")
      }, 1000)
      // (2) wait for outgoing space in the root's origin stack: 
      await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
      // (3) write a packet, just the scope request, to whatever route:
      let datagram = new Uint8Array(route.length + 1)
      datagram.set(route, 0)
      datagram[route.length] = PK.SCOPE_REQ.KEY
      // what's next? an ID for us to demux? 
      // (4) send the packet !
      osap.handle(datagram, VT.STACK_ORIGIN)
      // (4) await the result... 
      // resolve that / clear the timeout: 
      clearTimeout(to)
      console.log(datagram)
      // to catch, could do:
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          reject('timeout')
        }, 2000)
      })
    } catch (err) {
      throw err
    }
  }

  // scope *response* handler:
  this.scopeResponseHandler = (item, ptr) => {
    console.log('scope response', item)
    item.handled()
  }
}