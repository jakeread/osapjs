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

export default function NetRunner(osap) {

  let gs = {} // current graph object 
  let gsUpdateTimer = null 
  let onCompletedSweep = null 

  // little buffer, as a treat. if you want to abuse FC systems to test, remove this guard @ just set the timeout... 
  this.requestUpdateGS = () => {
    if(!gsUpdateTimer) gsUpdateTimer = setTimeout(this.updateGS, 50)
  }

  this.updateGS = async () => {
    // ensure timer dead 
    gsUpdateTimer = null 
    // so we want to start at the root (gs) and work our way through:
    // at any given time, any vertex has some state:
    /*
    (1) we don't know it exists yet 
    (2) we suspect it does, but haven't asked it out 
    (3) we are waiting for a reply [x] yes [x]no [o]maybe 
    (4) we have heard back, and it either replied or is unreachable (timed out) 
    */
    let now = TIMES.getTimeStamp()
    if(LOG_NETRUNNER) console.log(`sweep at ${now}`)
    let levelsComplete = 0
    let levelsTraversed = 0
    let recursor = (root) => {
      root.lastSweep = now 
      levelsTraversed ++ 
      let childrenComplete = 0
      for (let c = 0; c < root.children.length; c++) {
        if (root.children[c] == undefined) { //---------------------------------------------------- 0: child is undefined
          if(LOG_NETRUNNER) console.log(`finding child ${c} at ${root.name}`)
          root.children[c] = this.scope(PK.route(root.route, true).child(c).end(256, true))
          root.children[c].then((vvt) => {
            if(LOG_NETRUNNER) console.log(`found child ${c} at ${root.name}`)
            root.children[c] = vvt
            root.children[c].parent = root
            this.requestUpdateGS()
          }).catch((err) => {
            if(LOG_NETRUNNER) console.warn(`unreachable child ${c} at ${root.name}:`, err)
            root.children[c] = { type: "unreachable", parent: root }
            this.requestUpdateGS()
          })
        } else if (root.children[c].then) { // ---------------------------------------------------- 1: child is currently a promise
          // will wait for it... 
          // console.log(`awaiting ${root.name} child ${c} definition`)
        } else if (root.children[c].type == VT.VPORT && !root.children[c].reciprocal) { // -------- 2: is vport w/ undefined reciprocal 
          // will first collect the reciprocal, then use that to bump up to its parent... 
          if(LOG_NETRUNNER) console.log(`finding reciprocal of child ${c} at ${root.name}`)
          root.children[c].reciprocal = this.scope(PK.route(root.route, true).child(c).pfwd().end(256, true))
          root.children[c].reciprocal.then((vvtr) => {
            if(LOG_NETRUNNER) console.log(`found reciprocal of child ${c} at ${root.name}... parent next`)
            // pair them up:
            root.children[c].reciprocal = vvtr
            vvtr.reciprocal = root.children[c]
            // now get the parent, 
            this.scope(PK.route(root.route, true).child(c).pfwd().parent().end(256, true)).then((vvtp) => {
              if(LOG_NETRUNNER) console.log(`found parent of reciprocal of child ${c} at ${root.name}`)
              // parent's child (in proper index) is previously acquired reciprocal, 
              vvtp.children[vvtr.indice] = vvtr
              // this is it's parent, 
              vvtr.parent = vvtp
              // check graph again, will decide to traverse down... 
              this.requestUpdateGS()
            }).catch((err) => {
              // parent unreachable... let's take this corner case and just presume link borked 
              if(LOG_NETRUNNER) console.warn(`reciprocal parent for ${vtt.name} unreachable, scrapping reciprocal`)
              root.children[c].reciprocal = { type: "unreachable" }
              this.requestUpdateGS()
            })
          }).catch((err) => {
            // reciprocal unreachable, 
            if(LOG_NETRUNNER) console.warn(`unreachable reciprocal for vport ${c} at ${root.name} unreachable`)
            root.children[c].reciprocal = { type: "unreachable" }
            this.requestUpdateGS()
          })
        } else if (root.children[c].type == VT.VPORT && root.children[c].reciprocal.then) { // ---- 3: is vport w/ promise for reciprocal 
          // awaiting return of reciprocal port 
          //console.log(`awaiting ${c}: ${root.children[c].name} reciprocal...`)
        } else if (root.children[c].reciprocal && root.children[c].reciprocal.parent) { // -------- 4: is vport w/ reciprocal & parent:
          if(root.children[c].reciprocal.parent.lastSweep != now){
            if(LOG_NETRUNNER) console.warn('recursing', root.children[c].reciprocal.parent.name)
            recursor(root.children[c].reciprocal.parent)
          }
        } 
        // count, separate of messy else-if train above:
        if (root.children[c].type && root.children[c].type != VT.VPORT){
          childrenComplete ++
        } else if (root.children[c].type == VT.VPORT && root.children[c].reciprocal != null && !(root.children[c].reciprocal.then)){
          childrenComplete ++
        }
      } // end loop over children, 
      if(childrenComplete == root.children.length){
        if(LOG_NETRUNNER) console.log(`end state for ${root.name}`)
        levelsComplete ++ 
        if(levelsComplete == levelsTraversed){
          if(onCompletedSweep) onCompletedSweep(gs)
        }
      } else {
        if(LOG_NETRUNNER) console.log(`esc ${root.name} ${childrenComplete}, rl ${root.children.length}`)
      }
    }
    // start parti 
    recursor(gs)
  }

  // runs a sweep, starting at the osap root vertex 
  this.sweep = async () => {
    return new Promise(async (resolve, reject) => {
      gs = await this.scope(PK.route().end(256, true))
      this.requestUpdateGS()
      onCompletedSweep = (gs) => {
        resolve(gs)
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
  this.scope = async (route) => {
    try {
      // maybe a nice API in general is like 
      // (1) wait for outgoing space in the root's origin stack: 
      await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
      //console.log('flying...', TIMES.getTimeStamp(), route)
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
            reject(`scope timeout`)
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