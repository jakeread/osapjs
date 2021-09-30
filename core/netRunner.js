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

import { PK, TS, VT, TIMES } from './ts.js'

let PING_MAX_TIME = 2500 // ms 

export default function NetRunner(osap) {
  // fills in scope info for children of any root:
  this.scopeAllChildren = async (parent) => {
    try {
      // since we are assuming each sibling is reachable (the parent is reachable)
      // we can toss it all in one try block (?) 
      for (let c = 0; c < parent.children.length; c++) {
        let vvt = await this.scope(PK.route(parent.route, true).child(c).end(256, true))
        if(vvt.indice != c) throw new Error("vvt indice != searched indice, big bork")
        parent.children[c] = {
          type: vvt.type,
          indice: vvt.indice, 
          name: vvt.name,
          children: new Array(vvt.numChildren),
        }
      }
    } catch (err) {
      throw (err)
    }
  }

  // runs a sweep, starting at the osap root vertex 
  this.sweep = async () => {
    try {
      let root = {} // virtual graph root node... 
      // let's see if we can just scope the root ...
      let vvtRoot = await this.scope(PK.route().end(256, true))
      // now we can tack these on to the object... 
      root.type = vvtRoot.type
      root.indice = vvtRoot.indice
      root.name = vvtRoot.name
      root.children = new Array(vvtRoot.numChildren)
      root.siblings = new Array(vvtRoot.numSiblings)
      // then we want to track a route to each object: 
      root.route = PK.route().end(256, true)
      // now we would have some recursing, so maybe if it's a root object:
      await this.scopeAllChildren(root)
      console.log(root)
      // now... for each child, if it's a vport, see if we can find a new parent:
      for(let c = 0; c < root.children.length; c ++){
        if(root.children[c].type == VT.VPORT){
          let vvt = await this.scope(PK.route(root.route, true).child(c).pfwd().parent().end(256, true))
          console.log('next parent', vvt)
        }
      }
    } catch (err) {
      console.error(err)
      throw (err)
    }
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
  this.scope = async (route) => {
    try {
      // maybe a nice API in general is like 
      // (1) wait for outgoing space in the root's origin stack: 
      await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
      // (2) write a packet, just the scope request, to whatever route:
      let datagram = new Uint8Array(route.length + 2)
      datagram.set(route, 0)
      datagram[route.length] = PK.SCOPE_REQ.KEY
      datagram[route.length + 1] = getNewPingID()
      // what's next? an ID for us to demux? 
      // (3) send the packet !
      osap.handle(datagram, VT.STACK_ORIGIN)
      // (4) setup to handle the request, associating it w/ this fn  
      return new Promise((resolve, reject) => {
        pingsAwaiting.push({
          request: datagram.slice(),                   // the og request 
          id: datagram[route.length + 1],               // it's id 
          timeout: setTimeout(() => {                   // a timeout
            reject('timeout')
          }, PING_MAX_TIME),
          onResponse: function (item, ptr) {              // callback / handler 
            // clear timeout 
            clearTimeout(this.timeout)
            // now we want to resolve this w/ a description of the ...
            // virtual vertex ? vvt ? 
            let vvt = {}
            vvt.type = item.data[ptr + 2]
            vvt.indice = TS.read('uint16', item.data, ptr + 3)
            vvt.numSiblings = TS.read('uint16', item.data, ptr + 5)
            vvt.numChildren = TS.read('uint16', item.data, ptr + 7)
            vvt.name = TS.read('string', item.data, ptr + 9).value
            resolve(vvt)
          }
        })
      })
    } catch (err) {
      throw err
    }
  }

  // scope *response* handler:
  this.scopeResponseHandler = (item, ptr) => {
    let pingId = item.data[ptr + 1]
    let spliced = false
    for (let p = 0; p < pingsAwaiting.length; p++) {
      if (pingsAwaiting[p].id == pingId) {
        pingsAwaiting[p].onResponse(item, ptr)
        pingsAwaiting.splice(p, 1)
        spliced = true
      }
    }
    if (!spliced) { console.error("on ping response, no ID awaiting..."); PK.logPacket(item.data) }
    item.handled()
  }
}