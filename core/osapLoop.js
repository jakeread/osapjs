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

let osapLoop = (vt) => {
  osapHandler(vt)
  for (let child of vt.children) {
    osapLoop(child)
  }
}

let osapHandler = (vt) => {
  // time uniform across loops 
  let now = TIMES.getTimeStamp()
  // for each context, we run over origin and destination stacks
  for (let od = 0; od < 2; od++) {
    // collecting a list of items in the stack to handle 
    let count = Math.min(vt.stack[od].length, TIMES.stackSize)
    let items = vt.stack[od].slice(0, count)
    if(count && LOGHANDLER) console.warn(`switch pcks: ${count} at ${vt.indice} stack ${od}`)
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
      if(vt.destHandler(pck, ptr)){
        item.handled()
      } else {
        // await here, call next run 
      }
      break;
    case PK.SIB.KEY:
      // read-out the indice, 
      let si = TS.read('uint16', pck, ptr + 1)
      let sib = vt.parent.children[si]
      if (!sib) {
        console.log(`missing sibling ${si} at ${vt.indice}`)
        item.handled()
        return;
      }
      if (sib.stackAvailableSpace(VT.STACK_DEST) <= 0) {
        if(LOGSWITCH) console.log(`sibling wait ${sib.stack.length}`)
        vt.requestLoopCycle()
      } else {
        if(LOGSWITCH) console.log('shift into sib')
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
      throw new Error("parent")
      /*
      // has parent?
      if (!(context.parent)) {
        console.log("missing parent")
        pck.status = "err"
        return;
      }
      console.log('shift into parent')
      // increment and write to parent 
      pck[ptr - 1] = PK.CHILD.KEY
      TS.write('uint16', context.indice, pck, ptr)
      pck[ptr + 2] = PK.PTR
      // clear last, handle next 
      pck.status = "transmitted"
      context.parent.handle(pck, ptr + 2)
      */
      break;
    case PK.CHILD.KEY:
      throw new Error("child")
      /*
      // find child, 
      let ci = TS.read('uint16', pck, ptr + 1)
      let child = context.children[ci]
      if (!child) {
        console.log("missing child")
        pck.status = "err"
        return;
      }
      console.log('shift into child')
      // increment and write to child 
      pck[ptr - 1] = PK.PARENT.KEY
      TS.write('uint16', 0, pck, ptr)
      pck[ptr + 2] = PK.PTR
      // clear last, handle next 
      pck.status = "transmitted"
      child.handle(pck, ptr + 2)
      */
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
          if(LOGSWITCH) console.log(`pfwd hodl ${vt.name}`)
          vt.requestLoopCycle()
        }
      } else {
        console.log("pfwd at non-vport")
        item.handled()
      }
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

let ptrLoop = (pck, ptr) => {
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
        return undefined
    }
  } // end ptrloop
}

let reverseRoute = (pck, ptr) => {
  // similar here, 
  if (ptr == undefined) {
    ptr = ptrLoop(pck)
    ptr++ // ptr @ 'dest' key, 
    if (ptr == undefined) {
      return undefined
    }
  }
  // now pck[ptr] = PK.DEST
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