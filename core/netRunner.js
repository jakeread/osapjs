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
  let scanStartTime = 0 
  let allVPorts = []

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
    // per-node scan time: 
    let frontierScanTime = TIMES.getTimeStamp()
    if (LOG_NETRUNNER) console.log(`NR: now traversing vport ${vport.indice} ${vport.name} at ${vport.parent.name}`)
    try {
      // collect vport on the other side of this one:
      vport.reciprocal = await this.scope(PK.route(vport.route, true).pfwd().end(256, true), frontierScanTime)
      if(vport.reciprocal.previousTimeTag > scanStartTime){ 
        if (LOG_NETRUNNER) console.warn("lp here")
        for(let p of allVPorts){
          if (LOG_NETRUNNER) console.log(`${p.name}, ${p.timeTag}, ${vport.reciprocal.previousTimeTag}`)
          if(p.timeTag == vport.reciprocal.previousTimeTag){
            // we have it's parent, likely, let's see if we can hook:
            if (LOG_NETRUNNER) console.warn(`hooking lp to ${vport.reciprocal.indice}`)
            vport.reciprocal = p.parent.indice[vport.reciprocal.indice]
            break
          }
        }
        // let's check if we can find which one we pinged w/ this time... 
        throw new Error("loop detected")
      }
      let reciprocal = vport.reciprocal
      // add to tl list;
      allVPorts.push(reciprocal)
      // check it out, lol, the plumbing flushes both ways:
      reciprocal.reciprocal = vport
      // TODO: I think we would already have enough info to detect overlaps: w/ the reciprocal's 
      // console.log(vport.reciprocal.previousTimeTag)
      // it's parent: 
      vport.reciprocal.parent = await this.scope(PK.route(reciprocal.route, true).parent().end(256, true), frontierScanTime)
      let parent = vport.reciprocal.parent
      // and plumb that:
      parent.children[reciprocal.indice] = reciprocal
      // now we want to fill in the rest of the children:
      // could speed this up by transporting all child lookups before awaiting each, more packets flying 
      for (let c = 0; c < parent.children.length; c++) {
        if (parent.children[c] == undefined) {
          parent.children[c] = await this.scope(PK.route(reciprocal.route, true).sib(c).end(256, true), frontierScanTime)
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
          allVPorts.push(parent.children[c])
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
    scanStartTime = TIMES.getTimeStamp()
    // this is lazy, but I keep a set list of nodes as well:
    // we should only add to this list when a parent is complete / all children have been added 
    allVPorts = [] 
    return new Promise(async (resolve, reject) => {
      try {
        let root = await this.scope(PK.route().end(256, true), scanStartTime)
        // now each child, 
        for (let c = 0; c < root.children.length; c++) {
          root.children[c] = await this.scope(PK.route(root.route, true).child(c).end(256, true), scanStartTime)
          root.children[c].parent = root
        }
        // now launch query per virtual port,
        for (let c = 0; c < root.children.length; c++) {
          if (root.children[c].type == VT.VPORT) {
            // add to flat list 
            allVPorts.push(root.children[c])
            this.inspectFrontier(root.children[c])
          } else if (root.children[c].type == VT.VBUS) {
            console.warn("graph includes vbus, no vbus sweeping code yet... ")
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
          request: datagram.slice(),                    // the og request 
          id: datagram[route.length + 1],               // it's id 
          timeout: setTimeout(() => {                   // a timeout
            reject(`scope timeout`)
          }, PING_MAX_TIME),
          onResponse: function (item, ptr) {            // callback / handler 
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
    if (!spliced) { console.error(`on ping response, no ID awaiting... ${pingId}`); PK.logPacket(item.data) }
    item.handled()
  }
}