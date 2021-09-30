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

  // depth-first search is the easiest... will just try this: 
  this.recursor = async (root) => {
    // we always start w/ the root
    for (let c = 0; c < root.children.length; c++) {
      if (root.children[c] == undefined) {
        try {
          let vvt = await this.scope(PK.route(root.route, true).child(c).end(256, true))
          if (vvt.indice != c) throw new Error("vvt indice != searched indice, big bork")
          root.children[c] = vvt
          root.children[c].parent = root // aaaand we want to hook upstream 
        } catch (err) {
          console.warn(`unreachable child ${c} w/ parent ${root.name}`, err)
          root.children[c] = {
            type: "unreachable",
            parent: root 
          }
        }
      }
    } // end root children, 

    // now we want to see about any vports, 
    for (let c = 0; c < root.children.length; c++) {
      if (root.children[c].type == VT.VPORT && !(root.children[c].reciprocal)) {
        try {
          // this'll be a bit hack: first we look for the reciprocal vport:
          let vvtVPort = await this.scope(PK.route(root.route, true).child(c).pfwd().end(256, true))
          // if that works, find it's parent:
          let vvtParent = await this.scope(PK.route(root.route, true).child(c).pfwd().parent().end(256, true))
          // now we can attach the vport -> parent a-la: 
          vvtParent.children[vvtVPort.indice] = vvtVPort
          vvtVPort.parent = vvtParent
          // and hook the vports up to one another:
          vvtVPort.reciprocal = root.children[c] 
          root.children[c].reciprocal = vvtVPort 
          // and should be able to recurse down, 
          await this.recursor(vvtParent)
        } catch (err) {
          console.warn(`untraversable vport ${c} w/ parent ${root.name}`, err)
          // in this case 'vvt.reciprocal' will just == null... 
        }
      } else if (root.children[c].type == VT.VBUS){
        console.warn("! busses not yet sweepable")
      }
    }

  }

  // runs a sweep, starting at the osap root vertex 
  this.sweep = async () => {
    try {
      // scope for an (empty, unconnected) virtual graph vertex:
      let root = await this.scope(PK.route().end(256, true))
      // now we wait for the recursor to iteratively scan this tree...
      await this.recursor(root)
      return root
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
            vvt.route = route 
            vvt.type = item.data[ptr + 2]
            vvt.indice = TS.read('uint16', item.data, ptr + 3)
            vvt.name = TS.read('string', item.data, ptr + 9).value
            //vvt.siblings = TS.read('uint16', item.data, ptr + 5) // try ignoring siblings for now, 
            vvt.children = new Array(TS.read('uint16', item.data, ptr + 7)) 
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