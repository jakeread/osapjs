/*
osapLoop.js

common packet manipulation routines for OSAP

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { VT, PK, TIMES, TS } from "./ts.js"

let LOGHANDLER = false
let LOGSWITCH = false
// sed default arg to log-or-not, or override at specific call... 
let LOGLOOP = (msg, pck = null, log = false) => {
  if (log) console.warn('LP: ' + msg)
  if (log && pck) PK.logPacket(pck)
}

let loopItems = []

// this should be called just once per cycle, from the root vertex, 
let osapLoop = (root) => {
  // time is now, 
  let now = TIMES.getTimeStamp()
  // reset our list of items-to-handle, 
  loopItems = []
  // collect 'em recursively, 
  collectRecursor(root)
  // we want to pre-compute each items' time until death, this is handy in two places, 
  for (let item of loopItems) {
    item.timeToDeath = item.timeToLive - (now - item.arrivalTime)
  }
  // sort items by their time-to-live,
  loopItems.sort((a, b) => {
    // for the compare function, we return `> 0` if we want to sort a after b,
    // so we just want a's ttd - b's ttd, items which have more time until failure will 
    // be serviced *after* items whose life is on the line etc 
    return a.timeToDeath - b.timeToDeath
  })
  //console.warn(loopItems.length)
  // now we just go through each item, in order, and try to handle it...   
  for (let i = 0; i < loopItems.length; i++) {
    // handle 'em ! 
    osapItemHandler(loopItems[i])
  }
  // that's the end of the loop, folks 
  // items which have gone unhandled will have issued requests for new loops, 
  // this will fire again on those cycles, 
}

let collectRecursor = (vt) => {
  // we want to collect items from input & output stacks alike, 
  for (let od = 0; od < 2; od++) {
    for (let i = 0; i < vt.stack[od].length; i++) {
      loopItems.push(vt.stack[od][i])
    }
  }
  // then collect our children's items...
  for (let child of vt.children) {
    collectRecursor(child)
  }
}

let osapItemHandler = (item) => {
  LOGLOOP(`handling at ${item.vt.name}`, item.data)
  // kill deadies 
  if (item.timeToDeath < 0) {
    LOGLOOP(`LP: item at ${item.vt.name} times out`, null, true)
    item.handled(); return
  }
  // find ptrs, 
  let ptr = PK.findPtr(item.data)
  if (ptr == undefined) {
    LOGLOOP(`item at ${item.vt.name} is ptr-less`)
    item.handled(); return
  }
  // now we can try to transport it, switching on the instruction (which is ahead)
  switch (TS.readKey(item.data, ptr + 1)) {
    // packet is at destination, send to vertex to handle, 
    // if handler returns true, OK to destroy packet, else wait on it 
    case PK.DEST:
      if (item.vt.destHandler(item, ptr)) {
        item.handled()
      }
      break;
    // reply to pings
    case PK.PINGREQ:
      item.vt.pingRequestHandler(item, ptr)
      break;
    // handle replies *from* pings, 
    case PK.PINGRES:
      item.vt.pingResponseHandler(item, ptr)
      break;
    // reply to scopes
    case PK.SCOPEREQ:
      item.vt.scopeRequestHandler(item, ptr)
      break;
    // handle replies *from* scopes 
    case PK.SCOPERES:
      item.vt.scopeResponseHandler(item, ptr)
      break;
    // do internal transport, 
    case PK.SIB:
    case PK.PARENT:
    case PK.CHILD:
      osapInternalTransport(item, ptr)
      break;
    // do port-forwarding transport, 
    case PK.PFWD:
      // only possible if vertex is a vport, 
      if (item.vt.type == VT.VPORT) {
        // and if it's clear to send, 
        if (item.vt.cts()) {
          LOGLOOP(`pfwd OK at ${item.vt.name}`)
          // walk the ptr 
          PK.walkPtr(item.data, ptr, item.vt, 1)
          // send it... if we were to operate total-packet-ttl, we would also  
          // decriment the packet's ttl counter, but at the time of writing (2022-06-17) 
          // we are operating on per-hop ttl, 
          item.vt.send(item.data)
          item.handled()
        } else {
          LOGLOOP(`pfwd hold, not CTS at ${item.vt.name}`);
          item.vt.requestLoopCycle()
        }
      } else {
        LOGLOOP(`pfwd at non-vport, ${item.vt.name} is type ${item.vt.type}`, item.data)
        item.handled()
      }
      break;
    case PK.BFWD:
    case PK.BBRD:
      LOGLOOP(`bus transport request in JS, at ${item.vt.name}`, item.data)
      break;
    case PK.LLESCAPE:
      LOGLOOP(`low level escape msg from ${item.vt.name}`, null, true)
      break;
    default:
      LOGLOOP(`LP: item at ${item.vt.name} has unknown packet key after ptr, bailing`, item.data)
      item.handled()
      break;
  } // end item switch, 
}

// here we want to look thru potentially multi-hop internal moves & operate that transport... 
// i.e. we want to tunnel straight thru multiple steps, using the DAG as an addressing space 
// but not necessarily transport space 
let osapInternalTransport = (item, ptr) => {
  try {
    // starting at the items' vertice... 
    let vt = item.vt
    // new ptr to walk fwds, 
    let fwdPtr = ptr + 1
    // count # of ops, 
    let opCount = 0
    // loop thru internal ops until we hit a destination of a forwarding step, 
    fwdSweep: for (let h = 0; h < 16; h++) {
      LOGLOOP(`fwd look from ${vt.name}, ptr ${fwdPtr} key ${item.data[fwdPtr]}`)
      switch (TS.readKey(item.data, fwdPtr)) {
        // these are the internal transport cases: across, up, or down the tree 
        case PK.SIB:
          LOGLOOP(`instruction is sib, ${TS.readArg(item.data, fwdPtr)}`)
          if (!vt.parent) { throw new Error(`fwd to sib from ${vt.name}, but no parent exists`) }
          let sib = vt.parent.children[TS.readArg(item.data, fwdPtr)]
          if (!sib) { throw new Error(`fwd to sib ${TS.readArg(item.data, fwdPtr)} from ${vt.name}, but none exists`) }
          vt = sib
          break;
        case PK.PARENT:
          LOGLOOP(`instruction is parent, ${TS.readArg(item.data, fwdPtr)}`)
          if (!vt.parent) { throw new Error(`fwd to parent from ${vt.name}, but no parent exists`) }
          vt = vt.parent
          break;
        case PK.CHILD:
          LOGLOOP(`instruction is child, ${TS.readArg(item.data, fwdPtr)}`)
          let child = vt.children[TS.readArg(item.data, fwdPtr)]
          if (!child) { throw new Error(`fwd to child ${TS.readArg(item.data, fwdPtr)} from ${vt.name}, none exists`) }
          vt = child
          break;
        // these are all cases where i.e. the vt itself will handle, or networking will happen, 
        case PK.PFWD:
        case PK.BFWD:
        case PK.BBRD:
        case PK.DEST:
        case PK.PINGREQ:
        case PK.PINGRES:
        case PK.SCOPEREQ:
        case PK.SCOPERES:
        case PK.LLESCAPE:
          LOGLOOP(`context exit at ${vt.name}, counts ${opCount} ops`)
          // this is the end stop, we should see if we can transport in, 
          if (vt.stackAvailableSpace(VT.STACK_DEST) >= 0) {
            LOGLOOP(`clear to shift in to ${vt.name} from ${item.vt.name}, shifting...`)
            // we shift ptrs up, 
            PK.walkPtr(item.data, ptr, item.vt, opCount)
            // and ingest it at the new place, clearing the source, 
            vt.handle(item.data, VT.STACK_DEST)
            item.handled()
          } else {
            LOGLOOP(`flow-controlled from ${vt.name} to ${item.vt.name}, awaiting...`, null, true)
            item.vt.requestLoopCycle()
          }
          // fwd-look is terminal here in all cases, 
          break fwdSweep;
        default:
          LOGLOOP(`internal transport failure, bad key ${item.data[fwdPtr]}`)
          item.handled()
          return
      } // end switch 
      fwdPtr += 2;
      opCount++;
    }
  } catch (err) {
    console.error(err)
    item.handled()
    return 
  }
}

// ----------------------------------------------- OLD SHIT BELOW 

let osapHandler = (vt) => {
  // time uniform across loops 
  let now = TIMES.getTimeStamp()
  // for each context, we run over origin and destination stacks
  for (let od = 0; od < 2; od++) {
    // collecting a list of items in the stack to handle 
    let count = Math.min(vt.stack[od].length, TIMES.stackSize)
    let items = vt.stack[od].slice(0, count)
    if (count && LOGHANDLER) console.warn(`switch pcks: ${count} at ${vt.indice} stack ${od}`)
    for (let i = 0; i < count; i++) {
      // get handle, pointer, 
      let item = items[i]
      let ptr = ptrLoop(item.data, 0)
      // clear on bad ptr, 
      if (ptr == undefined) {
        console.log(`bad ptr walk at ${vt.name}`)
        PK.logPacket(item.data)
        item.handled()
        continue;
      }
      // clear on timeout, 
      if (item.arrivalTime + TIMES.staleTimeout < now) {
        console.log(`timeout at ${vt.name}`)
        item.handled()
        continue;
      }
      // run la switche 
      osapSwitch(vt, od, item, ptr, now)
    }
  }
}

let osapSwitch = (vt, od, item, ptr, now) => {
  // ... was pck[ptr] = PTR, want pck[PTR] = next instruction 
  let pck = item.data
  ptr++;
  switch (pck[ptr]) {
    case PK.DEST:
      //console.log(`${vt.type} is destination`)
      if (vt.destHandler(pck, ptr)) {
        item.handled()
        break;
      } else {
        // await here, call next run 
      }
      break;
    case PK.SIB.KEY:
      // read-out the indice, 
      let si = TS.read('uint16', pck, ptr + 1)
      if (!vt.parent) {
        console.error('no vt parent at sib switch')
        PK.logPacket(pck)
        item.handled();
        return
      }
      let sib = vt.parent.children[si]
      if (!sib) {
        console.log(`missing sibling ${si} at ${vt.indice}`)
        item.handled()
        return;
      }
      if (sib.stackAvailableSpace(VT.STACK_DEST) <= 0) {
        if (LOGSWITCH) console.log(`sibling wait ${sib.stack[VT.STACK_DEST].length}`)
        vt.requestLoopCycle()
      } else {
        if (LOGSWITCH) console.log('shift into sib')
        // increment block & write 
        pck[ptr - 1] = PK.SIB.KEY
        TS.write('uint16', vt.indice, pck, ptr)
        pck[ptr + 2] = PK.PTR
        // copy-in to next, 
        sib.handle(pck, VT.STACK_DEST)
        // clear out of last 
        item.handled()
      }
      break;
    case PK.PARENT.KEY:
      // has parent?
      if (!(vt.parent)) {
        console.log(`missing parent at ${vt.indice}`)
        item.handled()
        return;
      }
      if (vt.parent.stackAvailableSpace(VT.STACK_DEST) <= 0) {
        if (LOGSWITCH) console.log(`parent wait ${vt.parent.stack[VT.STACK_DEST].length}`)
        vt.requestLoopCycle()
      } else {
        if (LOGSWITCH) console.log('shift into parent')
        // increment block and write 
        pck[ptr - 1] = PK.CHILD.KEY
        TS.write('uint16', vt.indice, pck, ptr)
        pck[ptr + 2] = PK.PTR
        // copy in dest & clear source 
        vt.parent.handle(pck, VT.STACK_DEST)
        item.handled()
      }
      break;
    case PK.CHILD.KEY:
      // find child, 
      let ci = TS.read('uint16', pck, ptr + 1)
      let child = vt.children[ci]
      if (!child) {
        console.log(`missing child ${ci} at ${vt.indice}`)
        item.handled()
        return;
      }
      if (child.stackAvailableSpace(VT.STACK_DEST) <= 0) {
        if (LOGSWITCH) console.log(`child wait ${child.stack[VT.STACK_DEST].length}`)
        vt.requestLoopCycle()
      } else {
        if (LOGSWITCH) console.log('shift into child')
        // increment block & write 
        pck[ptr - 1] = PK.PARENT.KEY
        TS.write('uint16', 0, pck, ptr)
        pck[ptr + 2] = PK.PTR
        // copy in to child 
        child.handle(pck, VT.STACK_DEST)
        // clear out of parent 
        item.handled()
      }
      break;
    case PK.PFWD.KEY:
      if (vt.type == VT.VPORT) {
        if (vt.cts()) {
          //console.log("escape to vport send")
          // increment, so recipient sees ptr infront of next instruction 
          pck[ptr - 1] = PK.PFWD.KEY
          pck[ptr] = PK.PTR
          // ship it 
          vt.send(pck)
          item.handled()
        } else { // else, awaits here 
          if (LOGSWITCH) console.log(`pfwd hodl ${vt.name}`)
          vt.requestLoopCycle()
        }
      } else {
        console.log("pfwd at non-vport")
        item.handled()
      }
      break;
    case PK.BFWD.KEY:
      console.log(`${vt.name} rm packet for busfwd in js`)
      PK.logPacket(pck)
      item.handled()
      break;
    case PK.SCOPE_REQ.KEY:
      // we are actually going to write the reply *right back* into the OG item, 
      vt.scopeRequestHandler(item, ptr)
      break;
    case PK.SCOPE_RES.KEY:
      vt.scopeResponseHandler(item, ptr)
      break;
    case PK.LLESCAPE.KEY:
      let str = TS.read('string', pck, ptr + 1, true).value
      console.log('LL ESCAPE:', str)
      item.handled()
      break;
    default:
      // rx'd non-destination, can't do anything 
      console.log(`${vt.name} rm packet: bad switch at ${ptr} ${pck[ptr]}`)
      PK.logPacket(pck)
      item.handled()
      break;
  }
}

// will move to pk... 
let ptrLoop = (pck, ptr) => {
  console.error(`aye, ya shouldn't be using this one, m8, do PK.findPtr`)
  if (!ptr) ptr = 0
  for (let h = 0; h < 16; h++) {
    switch (pck[ptr]) {
      case PK.PTR:
        return ptr
      case PK.SIB.KEY:
        ptr += PK.SIB.INC
        break;
      case PK.PARENT.KEY:
        ptr += PK.PARENT.INC
        break;
      case PK.CHILD.KEY:
        ptr += PK.CHILD.INC
        break;
      case PK.PFWD.KEY:
        ptr += PK.PFWD.INC
        break;
      case PK.BFWD.KEY:
        ptr += PK.BFWD.INC
        break;
      case PK.LLESCAPE.KEY:
        ptr += PK.LLESCAPE.INC
      default:
        // unrecognized, escape !
        console.error('ptr not recognized', pck[ptr])
        return undefined
    }
  } // end ptrloop
  console.error('ptr exceeds 16 moves')
}

let reverseRoute = (pck, ptr, scope = false) => {
  // similar here, 
  if (ptr == undefined) {
    ptr = ptrLoop(pck)
    ptr++ // ptr @ 'dest' key, 
    if (ptr == undefined) {
      return undefined
    }
  }
  // now pck[ptr] = PK.DEST (!) unless this is a scope pckt, 
  // route is a new uint8, 
  let route = new Uint8Array(ptr + 3)
  // the tail is the same: same segsize, dest at end 
  for (let i = 3; i > 0; i--) {
    route[route.length - i] = pck[ptr + 3 - i]
  }
  // now we can reverse the stepwise,  
  let wptr = ptr      // write from the tail
  let end = ptr - 1   // don't write past the end, where pck[ptr] = 88
  let rptr = 0        // read from the head 
  // similar to the ptr walk, 
  walker: for (let h = 0; h < 16; h++) {
    if (rptr >= end) {
      //console.log(`break ${rptr}`)
      route[0] = PK.PTR // start, 
      break walker;
    }
    //console.log(`step ${rptr} = ${pck[rptr]}`)
    switch (pck[rptr]) {
      case PK.PTR:
        break;
      case PK.SIB.KEY:
        wptr -= PK.SIB.INC
        for (let i = 0; i < PK.SIB.INC; i++) {
          route[wptr + i] = pck[rptr++]
        }
        break;
      case PK.PARENT.KEY:
        wptr -= PK.PARENT.INC
        for (let i = 0; i < PK.PARENT.INC; i++) {
          route[wptr + i] = pck[rptr++]
        }
        break;
      case PK.CHILD.KEY:
        wptr -= PK.CHILD.INC
        for (let i = 0; i < PK.CHILD.INC; i++) {
          route[wptr + i] = pck[rptr++]
        }
        break;
      case PK.PFWD.KEY:
        wptr -= PK.PFWD.INC
        for (let i = 0; i < PK.PFWD.INC; i++) {
          route[wptr + i] = pck[rptr++]
        }
        break;
      case PK.BFWD.KEY:
        wptr -= PK.BFWD.INC
        for (let i = 0; i < PK.BFWD.INC; i++) {
          route[wptr + i] = pck[rptr++]
        }
        break;
      default:
        // unrecognized, escape !
        console.log('nonreq', rptr, pck[rptr])
        PK.logPacket(route)
        return undefined
    }
  } // end reverse walk 
  //console.log("reversed")
  //PK.logPacket(route)
  return route
}

export { osapLoop, ptrLoop, reverseRoute }