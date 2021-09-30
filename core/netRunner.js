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

  let runningPingID = 11
  let getNewPingID = () => {
    runningPingID++
    if (runningPingID > 255) { runningPingID = 0 }
    return runningPingID
  }
  let pingsAwaiting = []

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
      let datagram = new Uint8Array(route.length + 2)
      datagram.set(route, 0)
      datagram[route.length] = PK.SCOPE_REQ.KEY
      datagram[route.length + 1] = getNewPingID()
      // what's next? an ID for us to demux? 
      // (4) send the packet !
      osap.handle(datagram, VT.STACK_ORIGIN)
      // (4) await the result... 
      pingsAwaiting.push({
        request: datagram,
        id: datagram[route.length + 1],
        onResponse: function(item, ptr){
          // HERE: u r resolving this:
          console.log(item, ptr)
          console.warn('resoooooolution')
          // so: clear the timeout below (not above)
          // actually: should clear above timeout and 
          // attach another to this response object... right? see endpoint acks 
          // then generate whatever graph data you need from that reply (?) 
          // then recurse... 
        }
      })
      // resolve that / clear the timeout: 
      clearTimeout(to)
      console.log('sent ping req', datagram)
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
    let pingId = item.data[ptr + 1]
    let spliced = false 
    for(let p = 0; p < pingsAwaiting.length; p ++){
      if(pingsAwaiting[p].id == pingId){
        pingsAwaiting[p].onResponse(item, ptr)
        pingsAwaiting.splice(p, 1)
        spliced = true 
      }
    }
    if(!spliced) { console.error("on ping response, no ID awaiting..."); PK.logPacket(item.data) }
    item.handled()
  }
}