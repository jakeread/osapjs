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

let PING_MAX_TIME = 1000 // ms 
let LOG_NETRUNNER = false
let LOG_COMPLETION_CHECKS = false

export default function NetRunner(osap) {

  // global graph state, 
  let gs;
  let ccTimer = null
  let onCompletedSweep = null
  let latestScanTime = 0 

  let requestCompletionCheck = () => {
    if (!ccTimer) ccTimer = setTimeout(checkCompletion, 50)
  }

  let checkCompletion = () => {
    ccTimer = null
    if (!gs) return
    // we r going to walk the whole gd thing to see if anything is pending, 
    if (LOG_COMPLETION_CHECKS) console.warn('hang on, we are checking...')
    // we also have to use some timer action to ensure we don't check / recurse through twice 
    let checkTime = TIMES.getTimeStamp()
    let notDone = false
    let recursor = (vport) => {
      if (LOG_COMPLETION_CHECKS) console.warn('traverse across', vport.name)
      // reciprocal is here (we've tapped it), isn't awaiting (then) and has parent, not awaiting either... 
      if (vport.reciprocal && !vport.reciprocal.then && vport.reciprocal.parent && !vport.reciprocal.parent.then) {
        if (vport.reciprocal.lastCheckTime == checkTime) {
          if (LOG_COMPLETION_CHECKS) console.warn(`dident back up ${vport.name}`)
          return
        }
        let parent = vport.reciprocal.parent
        for (let c of parent.children) {
          if (c.then) {
            if (LOG_COMPLETION_CHECKS) console.warn('not done, 0')
            notDone = true
            return
          }
        }
        for (let c of parent.children) {
          c.lastCheckTime = checkTime
          if (c.type == VT.VPORT) {
            if (c.reciprocal && !c.reciprocal.then && c.reciprocal.parent && !c.reciprocal.parent.then) {
              recursor(c)
            } else if (c.reciprocal && c.reciprocal.type == "unreachable") {
              // ... unreachable, might be done ! 
            } else {
              if (LOG_COMPLETION_CHECKS) console.warn('not done, 1')
              notDone = true
              return
            }
          }
        }
      } else {
        if (LOG_COMPLETION_CHECKS) console.warn('not done, 2')
        notDone = true
        return
      }
    }
    // kick it 
    for (let c of gs.children) {
      c.lastCheckTime = checkTime
      if (c.type == VT.VPORT) {
        if (c.reciprocal && !c.reciprocal.then && c.reciprocal.parent && !c.reciprocal.parent.then) {
          recursor(c)
        }
      }
    }
    // check 
    if (!notDone && onCompletedSweep) onCompletedSweep(gs)
  }

  // block inspect one context:
  this.inspectFrontier = async (vport) => {
    if (LOG_NETRUNNER) console.log(`NR: now traversing vport ${vport.indice} ${vport.name} at ${vport.parent.name}`)
    try {
      // collect vport on the other side of this one:
      vport.reciprocal = await this.scope(PK.route(vport.route, true).pfwd().end(256, true), latestScanTime)
      if(vport.reciprocal.previousTimeTag == latestScanTime){ 
        throw new Error("loop detected")
        // TODO: actually find the matched reciprocal (which should already be in the object) and hook 'em up 
        // likely that we need to get more complex: if previousTagTime > latestScanStart, 
        // then go match w/ the vport's actual scan time, right? 
      }
      let reciprocal = vport.reciprocal
      // check it out, lol, the plumbing flushes both ways:
      reciprocal.reciprocal = vport
      // TODO: I think we would already have enough info to detect overlaps: w/ the reciprocal's 
      // console.log(vport.reciprocal.previousTimeTag)
      // it's parent: 
      vport.reciprocal.parent = await this.scope(PK.route(reciprocal.route, true).parent().end(256, true), latestScanTime)
      let parent = vport.reciprocal.parent
      // and plumb that:
      parent.children[reciprocal.indice] = reciprocal
      // now we want to fill in the rest of the children:
      for (let c = 0; c < parent.children.length; c++) {
        if (parent.children[c] == undefined) {
          parent.children[c] = await this.scope(PK.route(reciprocal.route, true).sib(c).end(256, true), latestScanTime)
          parent.children[c].parent = parent
        }
      }
      // check 4 completion 
      requestCompletionCheck()
      // and *finally* we can consider traaaaversing down: 
      // if the thing is a vport & it's *not* the one we entered on:
      for (let c = 0; c < parent.children.length; c++) {
        if (parent.children[c].type == VT.VPORT && c != reciprocal.indice) {
          //if(reciprocal.previousTimeTag == )
          this.inspectFrontier(parent.children[c])
        }
      }
    } catch (err) {
      if (LOG_NETRUNNER) console.error(err)
      if (LOG_NETRUNNER) console.log(`NR: unreachable across vport ${vport.indice} ${vport.name} at ${vport.parent.name}`)
      vport.reciprocal = { type: "unreachable" }
      // check 4 
      requestCompletionCheck()
    }
  }

  // runs a sweep, starting at the osap root vertex 
  this.sweep = async () => {
    latestScanTime = TIMES.getTimeStamp()
    return new Promise(async (resolve, reject) => {
      try {
        let root = await this.scope(PK.route().end(256, true), latestScanTime)
        // now each child, 
        for (let c = 0; c < root.children.length; c++) {
          root.children[c] = await this.scope(PK.route(root.route, true).child(c).end(256, true), latestScanTime)
          root.children[c].parent = root
        }
        // now launch query per virtual port,
        for (let c = 0; c < root.children.length; c++) {
          if (root.children[c].type == VT.VPORT) {
            this.inspectFrontier(root.children[c])
          }
        }
        // global, 
        gs = root
        // aaaand 
        onCompletedSweep = resolve
      } catch (err) {
        console.error(err)
        reject('sweep fails')
      }
    })
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
  this.scope = async (route, timeTag) => {
    try {
      if (!timeTag) console.warn("scope called w/ no timeTag")
      // maybe a nice API in general is like 
      // (1) wait for outgoing space in the root's origin stack: 
      await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
      //console.log('flying...', TIMES.getTimeStamp(), route)
      // (2) write a packet, just the scope request, to whatever route:
      let datagram = new Uint8Array(route.length + 6)
      datagram.set(route, 0)
      datagram[route.length] = PK.SCOPE_REQ.KEY
      datagram[route.length + 1] = getNewPingID()
      TS.write('uint32', timeTag, datagram, route.length + 2)
      // what's next? an ID for us to demux? 
      // (3) send the packet !
      osap.handle(datagram, VT.STACK_ORIGIN)
      // (4) setup to handle the request, associating it w/ this fn  
      return new Promise((resolve, reject) => {
        pingsAwaiting.push({
          request: datagram.slice(),                   // the og request 
          id: datagram[route.length + 1],               // it's id 
          timeout: setTimeout(() => {                   // a timeout
            reject(`scope timeout`)
          }, PING_MAX_TIME),
          onResponse: function (item, ptr) {              // callback / handler 
            // clear timeout 
            clearTimeout(this.timeout)
            // now we want to resolve this w/ a description of the ...
            // virtual vertex ? vvt ? 
            let vvt = {}
            vvt.route = route
            vvt.timeTag = timeTag // what we just tagged it with 
            vvt.previousTimeTag = TS.read('uint32', item.data, ptr + 2) // what it replies w/ as previous tag 
            vvt.type = item.data[ptr + 6]
            vvt.indice = TS.read('uint16', item.data, ptr + 7)
            //vvt.siblings = TS.read('uint16', item.data, ptr + 9) // try ignoring # siblings for now, 
            vvt.children = new Array(TS.read('uint16', item.data, ptr + 11))
            vvt.name = TS.read('string', item.data, ptr + 13).value
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