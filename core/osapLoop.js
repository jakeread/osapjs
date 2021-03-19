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

let osapLoop = (vt) => {
  osapHandler(vt)
  for(let child of vt.children){
    osapLoop(child)
  }
}

let osapHandler = (vt) => {
  // for each context, we run over origin and destination stacks
  for(let od = 0; od < 2; od ++){
    // collecting a list of items in the stack to handle 
    let count = Math.min(vt.stack[od].length, TIMES.stackSize)
    let items = vt.stack[od].slice(0, count)
    console.log('handle', items)
    for(let i = 0; i < count; i ++){
      let item = items[0]
      let ptr = ptrLoop(item.datagram, 0)
      console.log(ptr)
      here // continue w/ rework of this... should be pretty straight 
      // then test w/o flowcontrol to hella busses,
      // then get into flowcontrol at websockets / usb link 
    }
  }
  return

  //console.log(`${context.type} handle: ptr ${ptr}`)
  //PK.logPacket(pck.data)
  // find the ptr if not defined, 
  if (ptr == undefined) {
    ptr = ptrLoop(pck.data)
    if (ptr == undefined) {
      console.log("bad ptr walk: handler")
      pck.handled()
      return
    }
  }
  // check for timeouts 
  if (pck.arrivalTime + TIMES.staleTimeout < TIMES.getTimeStamp()) {
    console.log(`timeout at ${context.name}`)
    PK.logPacket(pck.data)
    pck.handled()
    return
  }
  // ...
  ptr++;
  // now ptr at next instruction 
  switch (pck.data[ptr]) {
    case PK.DEST:
      //console.log(`${context.type} is destination`)
      // flow control where destination is data sink 
      if (context.occupied()) {
        console.log('destination wait')
      } else {
        //console.log('escape to destination')
        // copy-in to destination, 
        context.dest(pck.data, ptr)
        // clear out of stack 
        pck.handled()
      }
      break;
    case PK.SIB.KEY:
      // read-out the indice, 
      let si = TS.read('uint16', pck.data, ptr + 1)
      let sib = context.parent.children[si]
      if (!sib) {
        console.log(`missing sibling ${si}`)
        console.log(context)
        pck.handled()
        return;
      }
      if(sib.stack.length >= 1024){ //TIMES.stackSize){
        console.log(`sibling wait ${sib.stack.length}`)
      } else {
        //console.log('shift into sib')
        // increment block & write 
        pck.data[ptr - 1] = PK.SIB.KEY
        TS.write('uint16', context.indice, pck.data, ptr)
        pck.data[ptr + 2] = PK.PTR
        // copy-in to next, 
        sib.handle(pck.data, ptr + 2)
        // clear out of last 
        pck.handled()  
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
      pck.data[ptr - 1] = PK.CHILD.KEY
      TS.write('uint16', context.indice, pck.data, ptr)
      pck.data[ptr + 2] = PK.PTR
      // clear last, handle next 
      pck.status = "transmitted"
      context.parent.handle(pck.data, ptr + 2)
      */
      break;
    case PK.CHILD.KEY:
      throw new Error("child")
      /*
      // find child, 
      let ci = TS.read('uint16', pck.data, ptr + 1)
      let child = context.children[ci]
      if (!child) {
        console.log("missing child")
        pck.status = "err"
        return;
      }
      console.log('shift into child')
      // increment and write to child 
      pck.data[ptr - 1] = PK.PARENT.KEY
      TS.write('uint16', 0, pck.data, ptr)
      pck.data[ptr + 2] = PK.PTR
      // clear last, handle next 
      pck.status = "transmitted"
      child.handle(pck.data, ptr + 2)
      */
      break;
    case PK.PFWD.KEY:
      if (context.type == VT.VPORT) {
        if(context.cts()){
          //console.log("escape to vport send")
          // increment, so recipient sees ptr infront of next instruction 
          pck.data[ptr - 1] = PK.PFWD.KEY
          pck.data[ptr] = PK.PTR
          // would check flowcontrol, 
          context.send(pck.data)
          pck.handled()
        } else { // else, awaits here 
          console.log(`hodl ${context.name}`)
        }
      } else {
        console.log("pfwd at non-vport")
        pck.handled()
      }
      break;
    case PK.LLESCAPE.KEY:
      let str = TS.read('string', pck.data, ptr + 1, true).value
      console.log('LL ESCAPE:', str)
      pck.handled()
      break;
    default:
      // rx'd non-destination, can't do anything 
      console.log(`${context.type} rm packet: bad switch at ${ptr} ${pck.data[ptr]}`)
      PK.logPacket(pck.data)
      pck.status = "exit"
      break;
  }
}

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
      case PK.LLESCAPE.KEY:
        ptr += PK.LLESCAPE.INC
      default:
        // unrecognized, escape !
        return undefined
    }
  } // end ptrloop
}

let reverseRoute = (pck, ptr) => {
  //console.log(`reverse w/ ptr ${ptr}`)
  //PK.logPacket(pck.data)
  // similar here, 
  if (ptr == undefined) {
    ptr = ptrLoop(pck.data)
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
    route[route.length - i] = pck.data[ptr + 3 - i]
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
    //console.log(`step ${rptr} = ${pck.data[rptr]}`)
    switch (pck.data[rptr]) {
      case PK.PTR:
        break;
      case PK.SIB.KEY:
        wptr -= PK.SIB.INC
        for (let i = 0; i < PK.SIB.INC; i++) {
          route[wptr + i] = pck.data[rptr++]
        }
        break;
      case PK.PARENT.KEY:
        wptr -= PK.PARENT.INC
        for (let i = 0; i < PK.PARENT.INC; i++) {
          route[wptr + i] = pck.data[rptr++]
        }
        break;
      case PK.CHILD.KEY:
        wptr -= PK.CHILD.INC
        for (let i = 0; i < PK.CHILD.INC; i++) {
          route[wptr + i] = pck.data[rptr++]
        }
        break;
      case PK.PFWD.KEY:
        wptr -= PK.PFWD.INC
        for (let i = 0; i < PK.PFWD.INC; i++) {
          route[wptr + i] = pck.data[rptr++]
        }
        break;
      case PK.BFWD.KEY:
        wptr -= PK.BFWD.INC
        for (let i = 0; i < PK.BFWD.INC; i++) {
          route[wptr + i] = pck.data[rptr++]
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

export { osapLoop, ptrLoop, reverseRoute }