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
  getTimeStamp: function() {return getTimeStamp()},
  delay: function(ms) {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, ms)
    })
  },
  stackSize: 4,
}

let VT = {
  ROOT: 22,
  MODULE: 23,
  ENDPOINT: 24, 
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
  PINGREQ: 192,    // hit me back 
  PINGRES: 176,    // here's ur ping 
  SCOPEREQ: 160,   // requesting scope info @ this location 
  SCOPERES: 144,   // replying to your scope request, 
  SIB: 16,          // sibling fwds,
  PARENT: 32,       // parent fwds, 
  CHILD: 48,        // child fwds, 
  PFWD: 64,         // forward at this port, to port's partner 
  BFWD: 80,         // fwd at this bus, to <arg> indice 
  BBRD: 96,         // broadcast here, to <arg> channel 
  LLESCAPE: 0,      // pls escape this string-formatted message... 
}

PK.logPacket = (buffer, routeOnly = false) => {
  // buffers-only club, 
  if(!(buffer instanceof Uint8Array)){
    console.warn(`attempt to log non-uint8array packet, bailing`)
    console.warn(buffer)
    return
  }
  // write an output msg, 
  let msg = ``
  msg += `PKT: \n`
  let startByte = 4 
  if(routeOnly){
    startByte = 0
  } else {
    // alright 1st 4 bytes are TTL and segSize 
    msg += `timeToLive: ${TS.read16(buffer, 0)}\n`
    msg += `segSize: ${TS.read16(buffer, 2)}\n`    
  }
  // now we have sets of instructions, 
  msgLoop: for(let i = startByte; i < buffer.length; i += 2){
    switch(TS.readKey(buffer, i)){
      case PK.PTR:
        msg += `[${buffer[i]}] PTR ---------------- v\n`
        i --;
        break;
      case PK.DEST:
        msg += `[${buffer[i]}] DEST, DATA LEN: ${buffer.length - i}`
        break msgLoop;
      case PK.PINGREQ:
        msg += `[${buffer[i]}], [${buffer[i + 1]}] PING REQUEST: ID: ${TS.readArg(buffer, i)}`;
        break msgLoop;
      case PK.PINGRES: 
        msg += `[${buffer[i]}], [${buffer[i + 1]}] PING RESPONSE: ID: ${TS.readArg(buffer, i)}`
        break msgLoop;
      case PK.SCOPEREQ:
        msg += `[${buffer[i]}], [${buffer[i + 1]}] SCOPE REQUEST: ID: ${TS.readArg(buffer, i)}`
        break msgLoop;
      case PK.SCOPERES:
        msg += `[${buffer[i]}], [${buffer[i + 1]}] SCOPE RESPONSE: ID: ${TS.readArg(buffer, i)}`
        break msgLoop;
      case PK.SIB:
        msg += `[${buffer[i]}], [${buffer[i + 1]}] SIB FWD: IND: ${TS.readArg(buffer, i)}\n`
        break;
      case PK.PARENT:
        msg += `[${buffer[i]}], [${buffer[i + 1]}] PARENT FWD: IND: ${TS.readArg(buffer, i)}\n`
        break;
      case PK.CHILD:
        msg += `[${buffer[i]}], [${buffer[i + 1]}] CHILD FWD: IND: ${TS.readArg(buffer, i)}\n`
        break;
      case PK.PFWD:
        msg += `[${buffer[i]}], [${buffer[i + 1]}] PORT FWD\n`
        break;
      case PK.BFWD:
        msg += `[${buffer[i]}], [${buffer[i + 1]}] BUS FWD: RXADDR: ${TS.readArg(buffer, i)}\n`
        break;
      case PK.BBRD:
        msg += `[${buffer[i]}], [${buffer[i + 1]}] BUS BROADCAST: CHANNEL: ${TS.readArg(buffer, i)}\n`
        break;
      case PK.LLESCAPE:
        msg += `[${buffer[i]}] LL ESCAPE, STRING LEN: ${buffer.length - i}`
        break msgLoop;
      default:
        msg += "BROKEN"
        break msgLoop;
    }
  } // end of loop-thru, 
  console.log(msg)
}

PK.route = (existing, scope = false) => {
  // start w/ a temp uint8 array, 
  let path = new Uint8Array(256) 
  let wptr = 0
  // copy-in existing path, if starting from some root, 
  if(existing != null && existing.length > 0){
    path.set(existing, 0)
    wptr = existing.length 
  } else {
    path[wptr ++] = PK.PTR
  }
  // add & return this, to chain... 
  return {
    sib: function(indice) {
      indice = parseInt(indice)
      TS.writeKeyArgPair(path, wptr, PK.SIB, indice)
      wptr += 2
      return this 
    },
    parent: function() {
      TS.writeKeyArgPair(path, wptr, PK.PARENT, 0)
      wptr += 2 
      return this 
    },
    child: function(indice) {
      indice = parseInt(indice)
      TS.writeKeyArgPair(path, wptr, PK.CHILD, indice)
      wptr += 2
      return this 
    },
    pfwd: function() {
      TS.writeKeyArgPair(path, wptr, PK.PFWD, 0)
      wptr += 2
      return this 
    },
    bfwd: function(indice){
      indice = parseInt(indice)
      TS.writeKeyArgPair(path, wptr, PK.BFWD, indice)
      wptr += 2
      return this 
    },
    bbrd: function(channel){
      channel = parseInt(channel)
      TS.writeKeyArgPair(path, wptr, PK.BBRD, channel)
      wptr += 2
      return this 
    },
    end: function() {
      console.log(path, wptr)
      return path.slice(0, wptr)
    }
  }
}

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
TS.read16 = (buffer, start) => {
  return TS.read('int16', buffer, start)
}

TS.readKey = (buffer, start) => {
  return buffer[start] & 0b11110000
}

// we use strange-endianness for arguments, 
TS.readArg = (buffer, start) => {
  return ((buffer[start] & 0b00001111) << 8) | buffer[start + 1]
}

TS.writeKeyArgPair = (buffer, start, key, arg) => {
  buffer[start] = key | (0b00001111 & (arg >> 8))
  buffer[start + 1] = arg & 0b11111111  
}

let decoder = new TextDecoder()
// let tempRead = {} 

TS.read = (type, buffer, start) => {
  // buffers-only club, 
  if(!(buffer instanceof Uint8Array)){
    console.warn(`attempt to read from non-uint8array buffer, bailing`)
    console.warn(buffer)
    return
  }
  // read it... 
  switch (type) {
    case 'int32':
      //tempRead = new Uint8Array(buffer)
      return new Int32Array(buffer.slice(start, start + 4).buffer)[0]
      //return (buffer[start] & 255) | (buffer[start + 1] << 8) | (buffer[start + 2] << 16) | (buffer[start + 3] << 24)
    case 'uint8':
      return buffer[start]
    case 'int16':
      //tempRead = new Uint8Array(buffer)
      return new Int16Array(buffer.slice(start, start + 2).buffer)[0]
      //return (buffer[start] & 255) | (buffer[start + 1] << 8)
    case 'uint16':
      // little endian: lsb is at the lowest address
      return (buffer[start] & 255) | (buffer[start + 1] << 8)
    case 'uint32':
      return (buffer[start] & 255) | (buffer[start + 1] << 8) | (buffer[start + 2] << 16) | (buffer[start + 3] << 24)
    case 'float32':
      // embedded- and js- elements end up coming in as Uint8Array and Buffer objects respectively, 
      // ... they should all just be Buffers, ffs, but here's a little non-performant convert to guard until we fix that 
      // try this blind convert 
      // tempRead = new Uint8Array(buffer)
      return new Float32Array(buffer.slice(start, start + 4).buffer)[0]
    case 'boolean':
      if (buffer[start] > 0) {
        return true
      } else {
        return false
      }
      break;
    case 'string':
      let length = (buffer[start] & 255) | (buffer[start + 1] << 8) | (buffer[start + 2] << 16) | (buffer[start + 3] << 24)
      let pckSlice = buffer.slice(start + 4, start + 4 + length)
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

TS.write = (type, value, buffer, start) => {
  // buffers-only club, 
  if(!(buffer instanceof Uint8Array)){
    console.warn(`attempt to write into non-uint8array packet, bailing`)
    console.warn(buffer)
    return
  }
  // write types... 
  switch (type) {
    case 'uint8':
      buffer[start] = value & 255
      return 1
    case 'uint16':
      // little endian: lsb is at the lowest address
      buffer[start] = value & 255
      buffer[start + 1] = (value >> 8) & 255
      return 2
    case 'int32':
      tempArr = Int32Array.from([value])
      tempBytes = new Uint8Array(tempArr.buffer)
      buffer.set(tempBytes, start)
      return 4
    case 'uint32':
      buffer[start] = value & 255
      buffer[start + 1] = (value >> 8) & 255
      buffer[start + 2] = (value >> 16) & 255
      buffer[start + 3] = (value >> 24) & 255
      return 4
    case 'float32':
      tempArr = Float32Array.from([value])
      tempBytes = new Uint8Array(tempArr.buffer)
      buffer.set(tempBytes, start)
      return 4 
    case 'char':
      //      console.log('char', value.charCodeAt(0))
      buffer[start] = value.charCodeAt(0)
      return 1
    case 'string': // so, would be good to send long strings (i.e. dirty old gcodes), so 32b base
      let stringStream = encoder.encode(value)
      //console.log("WRITING STRING", value)
      buffer[start] = stringStream.length & 255
      buffer[start + 1] = (stringStream.length >> 8) & 255
      buffer[start + 2] = (stringStream.length >> 16) & 255
      buffer[start + 3] = (stringStream.length >> 24) & 255
      buffer.set(stringStream, start + 4)
      return 4 + stringStream.length
    case 'boolean':
      if (value) {
        buffer[start] = 1
      } else {
        buffer[start] = 0
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
