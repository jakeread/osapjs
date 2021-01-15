/*
osap.js

protocol-abiding object, incl. links

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import VPort from './vport.js'

import { PK, DK, EP, TS, TIMES } from './ts.js'
import Endpoint from './osap-endpoint.js'
import MVC from './osap-mvc.js'

let LOGERRPOPS = true
let LOGRCRXBS = false
let LOGRX = false
let LOGTX = false
let TIMEOUT = 60

export default function OSAP() {
  // everyone has a name,
  this.name = "unnamed OSAP node"
  this.description = "undescribed OSAP node"
  // the node's virtual ports, and factory for them
  this.vPorts = []
  this.vPort = () => {
    let np = new VPort(this)
    this.vPorts.push(np)
    return np
  }
  // the node's virtual modules... none of these yet, just 
  this.vModules = []
  // just endpoints, bb
  this.endpoints = []
  this.endpoint = () => {
    let ep = new Endpoint(this)
    ep.indice = this.endpoints.length // set the indice, 
    this.endpoints.push(ep)
    return ep
  }

  // ------------------------------------------------------ Utility

  this.getTimeStamp = null

  if (typeof process === 'object') {
    const { PerformanceObserver, performance } = require('perf_hooks')
    this.getTimeStamp = () => {
      return performance.now()
    }
  } else {
    this.getTimeStamp = () => {
      return performance.now()
    }
  }

  this.reverseRoute = (pck) => {
    // find the current pck.ptr position, 
    let ptr = 0
    ptrloop: for (let i = 0; i < 16; i++) {
      switch (pck.data[ptr]) {
        case PK.PTR:
          break ptrloop; // ptr is set, 
        case PK.PORTF.KEY:
          ptr += PK.PORTF.INC
          break;
        case PK.BUSF.KEY:
        case PK.BUSB.KEY:
          ptr += PK.BUSF.INC
          break;
        default:
          if (LOGERRPOPS) {
            console.warn("on reverse route, can't find ptr")
            TS.logPacket(pck.data)
          }
          pck.vp.clear()
          return;
      }
    } // end ptrloop 
    if (!ptr) return; // ptr still 0 ? que ? bail 
    // proceed 
    let route = new Uint8Array(ptr) // size of route is 0 -> ptr 
    let wptr = 0
    // 1st, write outgoing info. in, js has the luxury of this always being a duplex 
    route[wptr++] = PK.PORTF.KEY
    TS.write('uint16', pck.vp.ownIndice(), route, wptr, true)
    wptr += 2 // keep up with ts.write 
    route[wptr] = PK.PTR // 1st forward, or instruction, follows this departure 
    // setup and walk tail-to-head, 
    let backstop = wptr   // don't reverse past here, 
    wptr = route.length   // will start writing from the tail, 
    let rptr = 0          // will start reading from the head, 
    for (let h = 0; h < 16; h++) { // walk ptr hops
      // never tested beyond reversing 1 link, but should be sound... 
      if (wptr <= backstop) {
        break; // escape the hop-loop, ur done 
      }
      switch (pck.data[rptr]) {
        case PK.PORTF.KEY:
          wptr -= PK.PORTF.INC
          for (let p = 0; p < PK.PORTF.INC; p++) {
            route[wptr + p] = pck.data[rp++]
          }
          break;
        case PK.BUSF.KEY:
        case PK.BUSB.KEY:
          wptr -= PK.BUSF.INC
          for (let p = 0; p < PKEYS.BUSF.INC; p++) {
            route[wptr + p] = pck.data[rp++]
          }
          break;
        default:
          TS.logPacket(pck.data)
          throw new Error("couldn't reverse this path")
          break;
      } // end switch
    } // end hops
    // check, return 
    if (wptr != backstop) {
      console.log("wptr", wptr, "backstop", backstop)
      throw new Error("route reversal broke")
    }
    let ackSegSize = pck.segsize
    if (LOGRX) console.log('RX: REVERSED ROUTE:', route, 'segsize: ', ackSegSize)
    return {
      path: route,
      segsize: ackSegSize
    }
  }

  let getOutgoingVPort = (route) => {
    let pi = TS.read('uint16', route.path, 1, true)
    let vp = this.vPorts[pi]
    let r0type = route.path[0]
    // check that this port type can handle the route type 
    if (vp) {
      if (vp.portTypeKey == EP.PORTTYPEKEY.DUPLEX) {
        if (r0type != PK.PORTF.KEY) {
          return { err: true, msg: 'attempt to transmit non-portf message on duplex vport' }
        }
      } else if (vp.portTypeKey == EP.PORTTYPEKEY.BUSHEAD) {
        if (r0type != PK.BUSB.KEY && r0type != PK.BUSF.KEY) {
          return { err: true, msg: 'attempt to transmit non-bus message on bus head' }
        }
      } else if (vp.portTypeKey == EP.PORTTYPEKEY.BUSDROP) {
        if (r0type != PK.BUSF.KEY) {
          return { err: true, msg: 'attempt to transmit non-bus-forward message (maybe broadcast) on bus drop incapable of broadcasting' }
        }
      }
    } else {
      return { err: true, msg: 'no vPort' }
    }
    // passes checks, return the vp object 
    return vp
  }

  // ------------------------------------------------------ OUTGOING HANDLES

  // route: uint8array, segsize: num / datagram: uint8array
  this.send = (route, datagram) => {
    return new Promise((resolve, reject) => {
      // get the outgoing vport, 1st route drop 
      let vp = getOutgoingVPort(route)
      if (vp.err) { reject(vp.msg); return }
      // check if cts,
      if (!vp.cts()) {
        reject("outgoing vport not cts")
        return
      }
      // otherwise we're clear to write the packet... just check datagram size against 
      // route segsize, and check that this is a port... 
      // path + length + ptr (1) + dest (1) + segsize (2) + checksum (2)
      let bytes = new Uint8Array(route.path.length + datagram.length + 6)
      if (bytes.length > route.segsize) {
        reject(`pck length ${bytes.length} greater than allowable route segsize ${route.segsize}`)
        return
      }
      // check if this is a bus transmit, will have to re-write for busf header 
      if (route.path[0] != PK.PORTF.KEY) {
        reject(`need to handle outgoing busses, apparently`)
        return
      }
      // past err-cases, continue
      bytes.set(route.path.subarray(0, 3), 0) // 1st departure port (1st item in route) before the ptr 
      bytes[3] = PK.PTR                       // ptr points at the following instruction, for next osap to handle
      bytes.set(route.path.subarray(3), 4)    // remaining route instructions (if any)
      bytes[route.path.length + 1] = PK.DEST  // destination at end of route, if ptr points at DEST, datagram is at target
      // allowable ack segment size following destination key,
      TS.write('uint16', route.segsize, bytes, route.path.length + 2, true)
      // checksum following aass
      TS.write('uint16', datagram.length, bytes, route.path.length + 4, true)
      // datagram
      bytes.set(datagram, route.path.length + 6) // +6: ptr (1) dest (1) segsize (2) checksum (2)
      if (LOGTX) { console.log('TX: wrote packet'); TS.logPacket(bytes.data) }
      // we're done writing, send it 
      console.warn('tx')
      TS.logPacket(bytes)
      vp.send(bytes)
      resolve()
    })
  }

  // ------------------------------------------------------ DATA to MODULES

  this.handleVModule = (pck, ptr) => {
    // virtual module indice, virtual module's data object indice 
    let vmfrom = TS.read('uint16', pck.data, ptr + 1, true)
    let vmepfrom = TS.read('uint16', pck.data, ptr + 3, true)
    let vmto = TS.read('uint16', pck.data, ptr + 5, true)
    let vmepto = TS.read('uint16', pck.data, ptr + 7, true)
    //console.log(`for ${vmi}, ${vmoi}, from ${vmfrom}, ${vmofrom}`)
    // find the module, 
    if (vmto > 0) {
      console.error("only top level modules for now")
    } else {
      if (this.endpoints[vmepto]) {
        this.endpoints[vmepto].onData(pck.data.subarray(ptr + 9))
      } else {
        console.error(`data node at ${vmoi} does not exist here`)
      }
    }
    pck.vp.clear()
  }

  // pck[ptr] == VMODULE_YACK or VMODULE_NACK 
  this.handleVModuleAck = (pck, ptr) => {
    let yn = pck[ptr] 
    // find it, etc,
    let vmfrom = TS.read('uint16', pck.data, ptr + 1, true)
    let vmepfrom = TS.read('uint16', pck.data, ptr + 3, true)
    let vmto = TS.read('uint16', pck.data, ptr + 5, true)
    let vmepto = TS.read('uint16', pck.data, ptr + 7, true)
    // holy shit, I'm going to have to route match to these things, aren't I? 
    console.error("ACK")
    // I think, for the route match the move is:
    // first, lookup the reciprocal endpoint, 
    // recall that we (will) store reversed routes in each endpoint, 
    // now we can find, in the reciprocal endpoint (if it exists) 
    // all routes to which this endpoint would be the target (just flipping from / to)
    // for multiples of those, proceed to match on the route itself 
    // clear the pck,  
    pck.vp.clear()
  }

  // write mvc codes to object
  MVC(this, TIMEOUT, LOGRX, LOGTX)

  // ------------------------------------------------------ HANDLING RX'd PACKS
  // pck.data[ptr] = DKEY, payload is for us 
  // vp is vPort arrived on, p is vp.rxbuffer[p] = pck (to pop)
  // acksegsize is allowable length of return route,
  let handle = (pck, ptr) => {
    if (LOGRX) console.log("RX: 5: handle")
    switch (pck.data[ptr]) {
      case DK.PINGREQ: // ping-request
        this.handlePingRequest(pck, ptr)
        break;
      case DK.PINGRES: // ping-responses
        this.handlePingResponse(pck, ptr)
        break;
      case DK.EPREQ:
        this.handleEntryPortRequest(pck, ptr)
        break;
      case DK.EPRES:
        this.handleEntryPortResponse(pck, ptr)
        break;
      case DK.RREQ: // read-requests
        this.handleReadRequest(pck, ptr)
        break;
      case DK.RRES:
        this.handleReadResponse(pck, ptr)
        break;
      case DK.WREQ: // write-request,
        this.handleWriteRequest(pck, ptr)
        break;
      case DK.WRES: // write-response
        this.handleWriteResponse(pck, ptr)
        break;
      case DK.VMODULE:
        this.handleVModule(pck, ptr)
        break;
      case DK.VMODULE_NACK:
      case DK.VMODULE_YACK:
        this.handleVModuleAck(pck, ptr)
        break;
      case DK.APP:
        //console.warn("APP")
        if (this.handleAppPackets) {
          this.handleAppPackets(pck, ptr)
        } else {
          console.warn('app packet, no handler')
          pck.vp.clear()
        }
        break;
      case DK.LLBYTES:
        // low level byte escape 
        console.log('LL Bytes: ')
        TS.logPacket(pck.data.subarray(ptr + 1));
        pck.vp.clear()
        break;
      case DK.LLERR:
        let str = TS.read('string', pck.data, ptr + 1, true).value
        console.error('LL ERR:', str)
        pck.vp.clear()
        break;
      // low level string escape 
      default:
        if (LOGERRPOPS) {
          console.log(`unrecognized DKEY: ${pck.data[ptr]} popping`)
          TS.logPacket(pck.data)
        }
        pck.vp.clear()
        break;
    }
  }

  // ------------------------------------------------------ FORWARDING

  // pck.data[ptr] = portf, busf, or busb key
  let forward = (pck, ptr) => {
    // fwded to ports only as of now, no js busses exist (but might! rpi uart!)
    if (pck.data[ptr] != PK.PORTF.KEY) {
      if (LOGERRPOPS) console.log('ERRPOP for non-port forward request, in js, where no busses exist')
      pck.vp.clear()
      return
    }
    // ok,
    let indice = TS.read('uint16', pck.data, ptr + 1, true)
    let fvp = this.vPorts[indice] // forwarding vPort
    if (fvp) {
      if (fvp.cts()) {
        // currently (all ports, incoming and outgoing, to js are portf / duplex: no busses)
        //                          [pck.data[ptr]]
        // [last_instruction:3][ptr][outgoing_instruction:3]
        // todo:
        // [ack_instruction:3][outgoing_instruction:3][ptr]
        ptr -= 4 // walk to start of prev. departure (was a port) (pk.ptr:1 + pk.portf.inc:3)
        pck.data[ptr++] = PK.PORTF.KEY // write in (re-asserting)
        // TODO: use fixed vp.indice property, instead of that lookup, to speed up fwd, improve js ring times?
        TS.write('uint16', pck.vp.ownIndice(), pck.data, ptr, true) // write *arrival port* indice in,
        ptr += 2 // now ptr at byte-after-arrival indice, 
        // shift next instruction back, do PK.PTR following 
        for (let i = 0; i < 3; i++) {
          pck.data[ptr] = pck.data[ptr + 1]
          ptr++
        }
        // put pck.ptr at the tail of this outgoing instruction 
        pck.data[ptr] = PK.PTR
        // now we ship this, not through osap.send (which writes a new route) but direct to the next vport
        fvp.send(pck.data)
        // and remove it from the incoming buffer 
        pck.vp.clear()
      } else {
        if (fvp.status() != EP.PORTSTATUS.OPEN) {
          if (LOGERRPOPS) console.log('ERRPOP for forward on closed port')
          pck.vp.clear()
          return
        } else {
          // no-op, wait for cts() onbuffer status or clears out on stale-ness 
        }
      }
    } else {
      if (LOGERRPOPS) console.log('ERRPOP for port forward on non existent port here', indice)
      pck.vp.clear()
      return
    }
  }

  // ------------------------------------------------------ SCAN RX ROUTINE

  // pck.data[ptr - 1] == PK.PTR, pck.data[ptr] is next instruction,
  // vp is vPort rx'd on,
  // vp.rxbuffer[p] = pck, pop this
  let instructionSwitch = (pck, ptr) => {
    switch (pck.data[ptr]) {
      case PK.PORTF.KEY:
      case PK.BUSF.KEY:
      case PK.BUSB.KEY:
        if (LOGRX) console.log('RX: 4: forward')
        forward(pck, ptr)
        break;
      case PK.DEST:
        if (LOGRX) console.log('RX: 4: destination land')
        pck.segsize = TS.read('uint16', pck.data, ptr + 1, true)
        pck.checksum = TS.read('uint16', pck.data, ptr + 3, true)
        if (pck.checksum != pck.data.length - (ptr + 5)) {
          if (LOGERRPOPS) {
            console.warn(`pop due to bad checksum, reported ${pck.checksum} bytes, have ${pck.data.length - (ptr + 5)}`)
            TS.logPacket(pck.data)
          }
          pck.vp.clear()
        } else {
          handle(pck, ptr + 5)
        }
        break;
      default:
        if (LOGERRPOPS) {
          console.warn(`pop due to unrecognized instruction switch ${pck.data[ptr]}`)
          TS.logPacket(pck.data)
        }
        pck.vp.clear()
    } // end instruction-switch
  }

  let rxTimer = null
  this.scanRx = () => {
    // TODO want to round robin the ports, making one attempt per frame, on a fairness-over-ports basis
    // for now, we can be simple
    // but ! recall that in this case, if i.e. the 1st pck in a vp buffer is going stale,
    // during that time no others will be handled 
    // embedded does this better: vports dish packets to osap on round-robin basis 
    if (LOGRX) console.log('RX: 1: scanRx')
    let now = this.getTimeStamp()
    // (1) first, do per-port handling of rx buffers
    for (let vp of this.vPorts) {
      // TODO: vp.read() does round-robin delivery of a fixed size pck array, 
      let pck = vp.read() // retrieve a packet 
      if (!pck) continue;
      // stale ?
      if (pck.arrivalTime + TIMES.staleTimeout < now) {
        if (LOGERRPOPS) console.warn(`RX: rm stale message from ${vp.name}`)
        pck.vp.clear()
        continue;
      }
      // walk for ptr,
      let ptr = 0
      ptrloop: for (let h = 0; h < 16; h++) {
        switch (pck.data[ptr]) {
          case PK.PTR:
            // do-next-key here
            instructionSwitch(pck, ptr + 1)
            break ptrloop;
          case PK.PORTF.KEY:
            // port-previous, keep looking for pointer,
            ptr += PK.PORTF.INC
            break;
          case PK.BUSF.KEY:
          case PK.BUSB.KEY:
            // old instruction to forward on a bus,
            ptr += PK.BUSF.INC
            break;
          case PK.LLERR:
            // low-level error, escaped from port directly adjacent
            if (LOGRX) console.log("RX: 3: LLERR")
            let str = TS.read('string', pck.data, ptr + 1, true).value
            console.error('LL ERR:', str)
            pck.vp.clear()
            break ptrloop;
          default:
            // unrecognized, escape !
            if (LOGERRPOPS) {
              TS.logPacket(pck.data)
              console.warn("pop due to bad walk for ptr")
            }
            pck.vp.clear()
            break ptrloop;
        }
      } // end ptrloop
    } // end for-vp-of-vPorts
    // done this loop, if it was called by a timer, clear it 
    if (rxTimer) clearTimeout(rxTimer)
    // if there's more to handle, set a new one: immediately next loop 
    for (let vp of this.vPorts) {
      if (vp.rxbuffer.length > 0) {
        rxTimer = setTimeout(this.scanRx, 0)
        break;
      }
    } // end check-if-remaining-to-handle
    /*
    // or, run this forever: 
    if(rxTimer) clearTimeout(rxTimer)
    rxTimer = setTimeout(this.scanRx, 0)
    */
  } // end scanRx

  this.onVPortReceive = (vp) => {
    this.scanRx() // could do this w/ one set to rxTimer, calling immediately after stack, 
  }

} // end OSAP
