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

import { PK, TS } from "./ts.js"

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
  console.log(`${context.type} handle: ptr ${ptr}`)
  PK.logPacket(pck.data)
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
      console.log(`${context.type} is destination`)
      context.onData(pck)
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
      if(context.type == "vport"){
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

export { ptrLoop, handler }