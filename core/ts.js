/*
ts.js // typeset

serialization, keys for OSAP

ends up being a kind of 'core import' for system params 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

let getTimeStamp = null

if (typeof process === 'object') {
  const { PerformanceObserver, performance } = require('perf_hooks')
  getTimeStamp = () => {
    return performance.now()
  }
} else {
  getTimeStamp = () => {
    return performance.now()
  }
}

let TIMES = {
  staleTimeout: 1000,
  getTimeStamp: function () { return getTimeStamp() },
  delay: function (ms) {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, ms)
    })
  },
  stackSize: 2,
}

let VT = {
  ROOT: 22,
  MODULE: 23,
  ENDPOINT: 24,
  QUERY: 25,
  VPORT: 44,
  VBUS: 45,
  STACK_ORIGIN: 0,
  STACK_DEST: 1
}

// 13: \r
// 10: \n
// these should be clearly delimited as L1 / L2 possible keys...

// diff like... 
// packet keys, for l0 of packets,
// PKEYS all need to be on the same byte order, since they're 
// walked
// TRANSPORT LAYER
let PK = {
  PTR: 240,         // packet pointer (next byte is instruction)
  DEST: 224,        // have arrived, (next bytes are for recipient)
  PINGREQ: 192,     // hit me back 
  PINGRES: 176,     // here's ur ping 
  SCOPEREQ: 160,    // requesting scope info @ this location 
  SCOPERES: 144,    // replying to your scope request, 
  SIB: 16,          // sibling fwds,
  PARENT: 32,       // parent fwds, 
  CHILD: 48,        // child fwds, 
  PFWD: 64,         // forward at this port, to port's partner 
  BFWD: 80,         // fwd at this bus, to <arg> indice 
  BBRD: 96,         // broadcast here, to <arg> channel 
  LLESCAPE: 112,    // pls escape this string-formatted message... 
}

PK.logPacket = (data, routeOnly = false) => {
  // uint8array-only club, 
  if (!(data instanceof Uint8Array)) {
    console.warn(`attempt to log non-uint8array packet, bailing`)
    console.warn(data)
    return
  }
  // write an output msg, 
  let msg = ``
  msg += `PKT: \n`
  let startByte = 4
  if (routeOnly) {
    startByte = 0
  } else {
    // alright 1st 4 bytes are TTL and segSize 
    msg += `timeToLive: ${TS.read16(data, 0)}\n`
    msg += `segSize: ${TS.read16(data, 2)}\n`
  }
  // now we have sets of instructions, 
  msgLoop: for (let i = startByte; i < data.length; i += 2) {
    switch (TS.readKey(data, i)) {
      case PK.PTR:
        msg += `[${data[i]}] PTR ---------------- v\n`
        i--;
        break;
      case PK.DEST:
        msg += `[${data[i]}] DEST, DATA LEN: ${data.length - i}`
        break msgLoop;
      case PK.PINGREQ:
        msg += `[${data[i]}], [${data[i + 1]}] PING REQUEST: ID: ${TS.readArg(data, i)}`;
        break msgLoop;
      case PK.PINGRES:
        msg += `[${data[i]}], [${data[i + 1]}] PING RESPONSE: ID: ${TS.readArg(data, i)}`
        break msgLoop;
      case PK.SCOPEREQ:
        msg += `[${data[i]}], [${data[i + 1]}] SCOPE REQUEST: ID: ${TS.readArg(data, i)}`
        break msgLoop;
      case PK.SCOPERES:
        msg += `[${data[i]}], [${data[i + 1]}] SCOPE RESPONSE: ID: ${TS.readArg(data, i)}`
        break msgLoop;
      case PK.SIB:
        msg += `[${data[i]}], [${data[i + 1]}] SIB FWD: IND: ${TS.readArg(data, i)}\n`
        break;
      case PK.PARENT:
        msg += `[${data[i]}], [${data[i + 1]}] PARENT FWD: IND: ${TS.readArg(data, i)}\n`
        break;
      case PK.CHILD:
        msg += `[${data[i]}], [${data[i + 1]}] CHILD FWD: IND: ${TS.readArg(data, i)}\n`
        break;
      case PK.PFWD:
        msg += `[${data[i]}], [${data[i + 1]}] PORT FWD: IND: ${TS.readArg(data, i)}\n`
        break;
      case PK.BFWD:
        msg += `[${data[i]}], [${data[i + 1]}] BUS FWD: RXADDR: ${TS.readArg(data, i)}\n`
        break;
      case PK.BBRD:
        msg += `[${data[i]}], [${data[i + 1]}] BUS BROADCAST: CHANNEL: ${TS.readArg(data, i)}\n`
        break;
      case PK.LLESCAPE:
        msg += `[${data[i]}] LL ESCAPE, STRING LEN: ${data.length - i}`
        break msgLoop;
      default:
        msg += "BROKEN"
        break msgLoop;
    }
  } // end of loop-thru, 
  console.log(msg)
  console.trace()
}

PK.route = (existing) => {
  // start w/ a temp uint8 array, 
  let path = new Uint8Array(256)
  let wptr = 0
  // copy-in existing path, if starting from some root, 
  if (existing != null && existing.path != undefined) {
    path.set(existing.path, 0)
    wptr = existing.path.length
  } else {
    path[wptr++] = PK.PTR
  }
  // add & return this, to chain... 
  return {
    sib: function (indice) {
      indice = parseInt(indice)
      TS.writeKeyArgPair(path, wptr, PK.SIB, indice)
      wptr += 2
      return this
    },
    parent: function () {
      TS.writeKeyArgPair(path, wptr, PK.PARENT, 0)
      wptr += 2
      return this
    },
    child: function (indice) {
      indice = parseInt(indice)
      TS.writeKeyArgPair(path, wptr, PK.CHILD, indice)
      wptr += 2
      return this
    },
    pfwd: function () {
      TS.writeKeyArgPair(path, wptr, PK.PFWD, 0)
      wptr += 2
      return this
    },
    bfwd: function (indice) {
      indice = parseInt(indice)
      TS.writeKeyArgPair(path, wptr, PK.BFWD, indice)
      wptr += 2
      return this
    },
    bbrd: function (channel) {
      channel = parseInt(channel)
      TS.writeKeyArgPair(path, wptr, PK.BBRD, channel)
      wptr += 2
      return this
    },
    end: function (ttl, segSize) {
      // we want to absorb ttl & segSize from existing if it was used, 
      // but also *not* of ttl and segSize are used here, 
      if(existing != null && existing.ttl && existing.segSize){
        ttl = existing.ttl
        segSize = existing.segSize
      } else {
        ttl = 1000
        segSize = 128 
      }
      // return a path object, 
      return {
        ttl: ttl, 
        segSize: segSize,
        path: new Uint8Array(path.subarray(0, wptr)),
      }
    }
  }
}

// where route = { ttl: <num>, segSize: <num>, path: <uint8array> }
PK.writeDatagram = (route, payload) => {
  let datagram = new Uint8Array(route.path.length + payload.length + 4)
  TS.write('uint16', route.ttl, datagram, 0)
  TS.write('uint16', route.segSize, datagram, 2)
  datagram.set(route.path, 4)
  datagram.set(payload, 4 + route.path.length)
  if(datagram.length > route.segSize) throw new Error(`writing datagram of len ${datagram.length} w/ segSize setting ${segSize}`);
  return datagram
}

PK.writeReply = (ogPck, payload) => {
  // find the pointer, 
  let ptr = PK.findPtr(ogPck)
  if (!ptr) throw new Error(`during reply-write, couldn't find the pointer...`);
  // our new datagram will be this long (ptr is location of ptr, len is there + 1) + the payload length, so 
  let datagram = new Uint8Array(ptr + 1 + payload.length)
  // we're using the OG ttl and segsize, so we can just write that in, 
  datagram.set(ogPck.subarray(0, 4))
  // and also write in the payload, which will come after the ptr's current position, 
  datagram.set(payload, ptr + 1)
  // now we want to do the walk-to-ptr, reversing... 
  // we write at the head of the packet, whose first byte is the pointer, 
  let wptr = 4
  datagram[wptr++] = PK.PTR
  // don't write past here, 
  let end = ptr 
  // read from the back, 
  let rptr = ptr
  walker: for (let h = 0; h < 16; h++) {
    if(wptr >= end) break walker;
    rptr -= 2
    switch (TS.readKey(ogPck, rptr)) {
      case PK.SIB:
      case PK.PARENT:
      case PK.CHILD:
      case PK.PFWD:
      case PK.BFWD:
      case PK.BBRD:
        // actually we can do the same action for each of these keys, 
        datagram.set(ogPck.subarray(rptr, rptr + 2), wptr)
        wptr += 2
        break;
      default:
        throw new Error(`during writeReply route reversal, encountered unpredictable key ${ogPck[rptr]}`)
    }
  }
  // that's it, 
  return datagram
}

// returns the position of the ptr key such that pck[ptr] == PK.PTR, or undefined 
PK.findPtr = (pck) => {
  // 1st position the ptr can be in is 4, 
  let ptr = 4
  // search fwd for a max of 16 steps, 
  for (let h = 0; h < 16; h++) {
    switch (TS.readKey(pck, ptr)) {
      case PK.PTR:    // it's the ptr, return it
        return ptr
      case PK.SIB:    // keys which could be between start of pckt and terminal, 
      case PK.PARENT:
      case PK.CHILD:
      case PK.PFWD:
      case PK.BFWD:
      case PK.BBRD:
        ptr += 2
        break;
      default:        // anything else means a broken packet, 
        return undefined
    }
  }
}

// walks the ptr ahead by n steps, putting reversed instructions behind, 
PK.walkPtr = (pck, ptr, source, steps) => {
  // check check... 
  if (pck[ptr] != PK.PTR) { throw new Error(`bad ptr walk, pck[ptr] == ${pck[ptr]} not PK.PTR`) }
  // walk along, switching on instructions... 
  for (let h = 0; h < steps; h++) {
    switch (TS.readKey(pck, ptr + 1)) {
      case PK.SIB: {
          // stash indice of from-whence it came, 
          let txIndice = source.indice 
          // track for this loop's next step, before we modify the packet data
          source = source.parent.children[TS.readArg(pck, ptr + 1)]
          // so, where ptr is currently goes the new key / arg pair for a reversal, 
          // for a sibling pass, that's the sibling to pass back to, 
          TS.writeKeyArgPair(pck, ptr, PK.SIB, txIndice)
          // then the position +2 from current ptr becomes the ptr, now it's just behind the next instruction, 
          pck[ptr + 2] = PK.PTR
          ptr += 2
        }
        break;
      case PK.PARENT:
        // reversal for a 'parent' instruction is to go back to the child, 
        TS.writeKeyArgPair(pck, ptr, PK.CHILD, source.indice)
        pck[ptr + 2] = PK.PTR
        // next source... 
        source = source.parent
        ptr += 2
        break;
      case PK.CHILD:
        // next src will be 
        source = source.children[TS.readArg(pck, ptr + 1)]
        // reversal for a 'child' instruction is to go back to the parent, 
        TS.writeKeyArgPair(pck, ptr, PK.PARENT, 0)
        pck[ptr + 2] = PK.PTR
        ptr += 2
        break;
      case PK.PFWD:
        // reversal for a pfwd is just a pointer hop, 
        TS.writeKeyArgPair(pck, ptr, PK.PFWD, 0)
        pck[ptr + 2] = PK.PTR
        // PFWD is a network instruction, we should only ever be ptr-walking once in this case, 
        if (steps != 1) throw new Error(`likely bad call to walkPtr, we have port-fwd here w/ more than 1 step`)
        return;
      case PK.BFWD:
      case PK.BBRD:
        throw new Error(`bus instructions in JS, badness`)
        break;
      case PK.PTR:    // this doesn't make any sense, we had pck[ptr] = PK.PTR, and are here at pck[ptr + 1]
      default:        // anything else means a broken instruction, 
        throw new Error(`out of place keys during a pointer increment`)
    }
  }
}

// we walk the ptr fwds, & stuff the pfwd instruction in reverse, 
// item.data[ptr] = PK.PFWD 
// item.data[ptr + 1] = 0 
// item.data[ptr + 2] = PK.PTR 


// endpoint layer 
let EP = {
  SS_ACK: 101,      // the ack, 
  SS_ACKLESS: 121,  // ackless transmit 
  SS_ACKED: 122,    // transmit requests ack 
  QUERY: 131,       // query for current data 
  QUERY_RESP: 132,  // query response 
  ROUTE_QUERY: 141, // request route list 
  ROUTE_RESP: 142,  // route list, 
  ROUTE_SET: 143,    // req-to-add-route 
  ROUTE_SET_RESP: 144,
  ROUTE_RM: 147,
  ROUTE_RM_RESP: 148,
  ROUTEMODE_ACKED: 167,
  ROUTEMODE_ACKLESS: 168,
}

let EPMSEG = {
  QUERY: 141,
  QUERY_RESP: 142,
  QUERY_END_RESP: 143
}

let TS = {}

// just shorthands, 
TS.read16 = (data, start) => {
  return TS.read('int16', data, start)
}

TS.write16 = (value, data, start) => {
  TS.write('uint16', value, data, start)
}

TS.readKey = (data, start) => {
  return data[start] & 0b11110000
}

// we use strange-endianness for arguments, 
TS.readArg = (data, start) => {
  return ((data[start] & 0b00001111) << 8) | data[start + 1]
}

TS.writeKeyArgPair = (data, start, key, arg) => {
  data[start] = key | (0b00001111 & (arg >> 8))
  data[start + 1] = arg & 0b11111111
}

let decoder = new TextDecoder()
// let tempRead = {} 

TS.read = (type, data, start) => {
  // uint8array-only club, 
  if (!(data instanceof Uint8Array)) {
    console.warn(`attempt to read from non-uint8array data, bailing`)
    console.warn(data)
    return
  }
  // read it... 
  switch (type) {
    case 'int32':
      return new Int32Array(data.buffer.slice(start, start + 4))[0]
    case 'uint8':
      return new Uint8Array(data.buffer.slice(start, start + 1))[0]
    case 'int16':
      return new Int16Array(data.buffer.slice(start, start + 2))[0]
    case 'uint16':
      return new Uint16Array(data.buffer.slice(start, start + 2))[0]
    case 'uint32':
      return new Uint32Array(data.buffer.slice(start, start + 4))[0]
    case 'float32':
      return new Float32Array(data.buffer.slice(start, start + 4))[0]
    case 'boolean':
      if (data[start] > 0) {
        return true
      } else {
        return false
      }
      break;
    case 'string':
      let length = (data[start] & 255) | (data[start + 1] << 8) | (data[start + 2] << 16) | (data[start + 3] << 24)
      let pckSlice = data.buffer.slice(start + 4, start + 4 + length)
      return {
        value: decoder.decode(pckSlice),
        inc: length + 4
      }
    default:
      console.error('no code for this type read')
      return null
      break;
  }
}

let encoder = new TextEncoder()
let tempArr = {}
let tempBytes = {}

TS.write = (type, value, data, start) => {
  // uint8arrays-only club, 
  if (!(data instanceof Uint8Array)) {
    console.warn(`attempt to write into non-uint8array packet, bailing`)
    console.warn(data)
    return
  }
  // write types... 
  switch (type) {
    case 'uint8':
      data[start] = value & 255
      return 1
    case 'uint16':
      // little endian: lsb is at the lowest address
      data[start] = value & 255
      data[start + 1] = (value >> 8) & 255
      return 2
    case 'int32':
      tempArr = Int32Array.from([value])
      tempBytes = new Uint8Array(tempArr.buffer)
      data.set(tempBytes, start)
      return 4
    case 'uint32':
      data[start] = value & 255
      data[start + 1] = (value >> 8) & 255
      data[start + 2] = (value >> 16) & 255
      data[start + 3] = (value >> 24) & 255
      return 4
    case 'float32':
      tempArr = Float32Array.from([value])
      tempBytes = new Uint8Array(tempArr.buffer)
      data.set(tempBytes, start)
      return 4
    case 'char':
      //      console.log('char', value.charCodeAt(0))
      data[start] = value.charCodeAt(0)
      return 1
    case 'string': // so, would be good to send long strings (i.e. dirty old gcodes), so 32b base
      let stringStream = encoder.encode(value)
      //console.log("WRITING STRING", value)
      data[start] = stringStream.length & 255
      data[start + 1] = (stringStream.length >> 8) & 255
      data[start + 2] = (stringStream.length >> 16) & 255
      data[start + 3] = (stringStream.length >> 24) & 255
      data.set(stringStream, start + 4)
      return 4 + stringStream.length
    case 'boolean':
      if (value) {
        data[start] = 1
      } else {
        data[start] = 0
      }
      return 1
    default:
      console.error('no code for this type write')
      return null
      break;
  }
}

export {
  PK,     // onion routing keys 
  TS,     // typeset 
  VT,     // object types 
  EP,     // endpoint keys 
  EPMSEG,
  TIMES   // time utilities 
}
