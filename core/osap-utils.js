/*
osap-utils.js

common packet manipulation routines for OSAP

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { OT, PK, TS } from "./ts.js"

let ptrLoop = (buffer, ptr) => {
  if (!ptr) ptr = 0

  for (let h = 0; h < 16; h++) {
    switch (buffer[ptr]) {
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
      default:
        // unrecognized, escape !
        return undefined
    }
  } // end ptrloop
}

let handler = (context, pck, ptr) => {
  //console.log(`${context.type} handle: ptr ${ptr}`)
  //PK.logPacket(pck.data)
  // find the ptr if not defined, 
  if (ptr == undefined) {
    ptr = ptrLoop(pck.data)
    if (ptr == undefined) {
      pck.handled()
      return
    }
  }
  // would do check for times, 
  // ...
  ptr++;
  // now ptr at next instruction 
  switch (pck.data[ptr]) {
    case PK.DEST:
      //console.log(`${context.type} is destination`)
      context.onData(pck, ptr)
      pck.handled()
      break;
    case PK.SIB.KEY:
      // read-out the indice, 
      let si = TS.read('uint16', pck.data, ptr + 1)
      let sib = context.parent.children[si]
      if (!sib) {
        console.log("missing sibling")
        pck.handled()
        return;
      }
      if (sib.clear()) {
        // increment block & write 
        pck.data[ptr - 1] = PK.SIB.KEY
        TS.write('uint16', context.indice, pck.data, ptr)
        pck.data[ptr + 2] = PK.PTR
        sib.handle(pck, ptr + 2)
      }
      break;
    case PK.PARENT.KEY:
      // has parent?
      if(!(context.parent)){
        console.log("missing parent")
        pck.handled()
        return;
      }
      // can parent handle?
      if (context.parent.clear()) {
        // increment and write to parent 
        pck.data[ptr - 1] = PK.CHILD.KEY
        TS.write('uint16', context.indice, pck.data, ptr)
        pck.data[ptr + 2] = PK.PTR
        context.parent.handle(pck, ptr + 2)
      }
      break;
    case PK.CHILD.KEY:
      // find child, 
      let ci = TS.read('uint16', pck.data, ptr + 1)
      let child = context.children[ci]
      if(!child){
        console.log("missing child")
        pck.handled() 
        return;
      }
      // can child handle?
      if(child.clear()){
        // increment and write to child 
        pck.data[ptr - 1] = PK.PARENT.KEY 
        TS.write('uint16', 0, pck.data, ptr)
        pck.data[ptr + 2] = PK.PTR 
        child.handle(pck, ptr + 2)
      }
      break;
    case PK.PFWD.KEY:
      if(context.type == OT.VPORT){
        // increment, so recipient sees ptr infront of next instruction 
        pck.data[ptr - 1] = PK.PFWD.KEY
        pck.data[ptr] = PK.PTR
        // would check flowcontrol, 
        context.send(pck.data)
        pck.handled()
      } else {
        console.log("pfwd at non-vport")
        pck.handled()
      }
      break;
    default:
      // rx'd non-destination, can't do anything 
      console.log(`${context.type} rm packet: bad switch`)
      PK.logPacket(pck.data)
      pck.handled()
  }
}

let reverseRoute = (pck, ptr) => {
  //console.log(`reverse w/ ptr ${ptr}`)
  //PK.logPacket(pck.data)
  // similar here, 
  if (ptr == undefined) {
    ptr = ptrLoop(pck.data)
    ptr ++ // ptr @ 'dest' key, 
    if (ptr == undefined) {
      pck.handled()
      return
    }
  }
  // now pck[ptr] = PK.DEST
  // route is a new uint8, 
  let route = new Uint8Array(ptr + 3)
  // the tail is the same: same segsize, dest at end 
  for(let i = 3; i > 0; i --){
    route[route.length - i] = pck.data[ptr + 3 - i]
  }
  // now we can reverse the stepwise,  
  let wptr = ptr      // write from the tail
  let end = ptr - 1   // don't write past the end, where pck[ptr] = 88
  let rptr = 0        // read from the head 
  // similar to the ptr walk, 
  walker: for (let h = 0; h < 16; h++) {
    if(rptr >= end) {
      //console.log(`break ${rptr}`)
      route[0] = PK.PTR // start, 
      break walker;
    }
    //console.log(`step ${rptr} = ${pck.data[rptr]}`)
    switch (pck.data[rptr]) {
      case PK.PTR:
        break;
      case PK.SIB.KEY:
        wptr -= PK.SIB.INC 
        for(let i = 0; i < PK.SIB.INC; i ++){
          route[wptr + i] = pck.data[rptr ++]
        }
        break;
      case PK.PARENT.KEY:
        wptr -= PK.PARENT.INC 
        for(let i = 0; i < PK.PARENT.INC; i ++){
          route[wptr + i] = pck.data[rptr ++]
        }
        break;
      case PK.CHILD.KEY:
        wptr -= PK.CHILD.INC 
        for(let i = 0; i < PK.CHILD.INC; i ++){
          route[wptr + i] = pck.data[rptr ++]
        }
        break;
      case PK.PFWD.KEY:
        wptr -= PK.PFWD.INC 
        for(let i = 0; i < PK.PFWD.INC; i ++){
          route[wptr + i] = pck.data[rptr ++]
        }
        break;
      case PK.BFWD.KEY:
        wptr -= PK.BFWD.INC 
        for(let i = 0; i < PK.BFWD.INC; i ++){
          route[wptr + i] = pck.data[rptr ++]
        }
        break;
      default:
        // unrecognized, escape !
        console.log('nonreq', rptr, pck.data[rptr])
        PK.logPacket(route)
        return undefined
    }
  } // end reverse walk 
  //console.log("reversed")
  //PK.logPacket(route)
  return route 
}

export { ptrLoop, handler, reverseRoute }