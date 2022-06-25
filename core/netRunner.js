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

import { TS, VT } from './ts.js'
import TIME from './time.js'
import PK from './packets.js'

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
    let checkTime = TIME.getTimeStamp()
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
          if (c && c.then) {
            if (LOG_COMPLETION_CHECKS) console.warn('not done, 0')
            notDone = true
            return
          }
        }
        for (let c of parent.children) {
          if (!c) {
            notDone = true
            // console.warn(checkTime, parent.children)
            return
          }
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
    let frontierScanTime = TIME.getTimeStamp()
    if (LOG_NETRUNNER) console.log(`NR: now traversing vport ${vport.indice} ${vport.name} at ${vport.parent.name}`)
    try {
      // collect vport on the other side of this one:
      // .end(ttl, segSize)
      vport.reciprocal = await osap.scope(PK.route(vport.route, true).pfwd().end(250, 128), frontierScanTime)
      if (vport.reciprocal.previousTimeTag > scanStartTime) {
        if (LOG_NETRUNNER) console.warn("lp here")
        for (let p of allVPorts) {
          if (LOG_NETRUNNER) console.log(`${p.name}, ${p.timeTag}, ${vport.reciprocal.previousTimeTag}`)
          if (p.timeTag == vport.reciprocal.previousTimeTag) {
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
      vport.reciprocal.parent = await osap.scope(PK.route(reciprocal.route, true).parent().end(250, 128), frontierScanTime)
      let parent = vport.reciprocal.parent
      // and plumb that:
      parent.children[reciprocal.indice] = reciprocal
      // now we want to fill in the rest of the children:
      // could speed this up by transporting all child lookups before awaiting each, more packets flying 
      for (let c = 0; c < parent.children.length; c++) {
        if (parent.children[c] == undefined) {
          parent.children[c] = await osap.scope(PK.route(reciprocal.route, true).sib(c).end(250, 128), frontierScanTime)
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
      if (true) console.error(err)
      if (LOG_NETRUNNER) console.log(`NR: unreachable across vport ${vport.indice} ${vport.name} at ${vport.parent.name}`)
      vport.reciprocal = { type: "unreachable" }
      // check 4 
      requestCompletionCheck()
    }
  }

  // runs a sweep, starting at the osap root vertex 
  this.sweep = async () => {
    scanStartTime = TIME.getTimeStamp()
    // this is lazy, but I keep a set list of nodes as well:
    // we should only add to this list when a parent is complete / all children have been added 
    allVPorts = []
    return new Promise(async (resolve, reject) => {
      try {
        let root = await osap.scope(PK.route().end(250, 128), scanStartTime)
        // now each child, 
        for (let c = 0; c < root.children.length; c++) {
          root.children[c] = await osap.scope(PK.route(root.route).child(c).end(), scanStartTime)
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

  // walks routes along a virtual graph, returning a list of stops, 
  this.routeWalk = (route, source) => {
    //console.log('walking', route, 'from', source)
    if (!(route.path instanceof Uint8Array)) { throw new Error(`strange route structure in the routeWalk fn, netRunner`) }
    // we'll make a list... of vvts, which are on this path, 
    // walking along the route... 
    let ptr = 1, indice = 0, vvt = source, list = []
    // append vvt to head of list, or no? yah, should do 
    list.push(vvt)
    for (let s = 0; s < 16; s++) {
      if (ptr >= route.path.length) {
        return { path: list, state: 'complete' }
      }
      switch (route.path[ptr]) {
        case PK.SIB:
          indice = PK.readArg(route.path, ptr)
          // do we have it ? 
          if (vvt.parent && vvt.parent.children[indice]) {
            vvt = vvt.parent.children[indice]
            list.push(vvt)
            break; 
          } else {
            return { path: list, state: 'incomplete', reason: 'missing sib' }
          }
        case PK.PFWD:
          if (vvt.reciprocal && vvt.reciprocal.type != "unreachable") {
            vvt = vvt.reciprocal
            list.push(vvt)
            break
          } else {
            return { path: list, state: 'incomplete', reason: 'nonconn vport' }
          }
        default:
          return { path: list, state: 'incomplete', reason: 'default switch' }
      }
      // increment to next, 
      ptr += 2 
    }
  }

  // tool to add routes... head & tail should be vvts in the same graph, we want to search betwixt, 
  this.findRoute = (head, tail) => {
    console.warn('searching between...', head.route, tail.route)
    // we... recursively poke around? this is maybe le-difficult, 
    let recursor = (route, from) => {
      console.warn('recurse', route)
      // copy...
      route = {
        ttl: route.ttl, 
        segSize: route.segSize,
        path: new Uint8Array(route.path)
      }
      // first... look thru siblines at this level, 
      for (let s in from.parent.children) {
        s = parseInt(s)
        let sib = from.parent.children[s]
        // if that's the ticket, ship it, 
        if (sib == tail) {
          return PK.route(route).sib(s).end()
        }
      }
      // if not, find ports, 
      let results = []
      for (let s in from.parent.children) {
        s = parseInt(s)
        let sib = from.parent.children[s]
        if (sib.type == VT.VPORT && sib != from) {
          if (sib.reciprocal && sib.reciprocal.type != "unreachable") {
            // sweep, then pick first... 
            // as a warning... this is not loop safe ! 
            results.push(recursor(PK.route(route).sib(s).pfwd().end(), sib.reciprocal))
            for(let res of results){
              if(res != null) return res 
            }
          }
        }
      }
      console.log('returning null...')
      return null
    } // end recursor 
    // start recursor w/ initial route-to-self, 
    return recursor(PK.route().end(), head)
  }
}