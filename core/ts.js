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
  PTR: 88,    // packet pointer (next byte is instruction)
  DEST: 99,   // have arrived, (next bytes are for recipient)
  SIB: {
    KEY: 15,
    INC: 3
  },
  PARENT: {
    KEY: 16,
    INC: 3
  },
  CHILD: {
    KEY: 14,
    INC: 3
  },
  PFWD: {
    KEY: 11, 
    INC: 1
  },
  BFWD: {
    KEY: 12,
    INC: 3
  },
  SCOPE_REQ: {
    KEY: 21,
    INC: 1
  },
  SCOPE_RES: {
    KEY: 22,
    INC: 1
  },
  LLESCAPE: {
    KEY: 44, 
    INC: 1
  }
}

PK.logPacket = (buffer) => {
  // log a pretty buffer
  // buffers should all be Uint8Array views,
  let pert = []
  for (let i = 0; i < buffer.length; i++) {
    pert.push(buffer[i])
  }
  console.log(pert)
}

PK.route = (existing, scope = false) => {
  let path = [PK.PTR]
  if(existing != null && existing.length > 0){
    //console.log('existing', JSON.parse(JSON.stringify(existing)))
    path = JSON.parse(JSON.stringify(existing))
    if(!scope) { path.splice(-3, 3) } // don't sleugh off dest if dealing w/ scope pckts 
    //console.log('fin start', JSON.parse(JSON.stringify(path)))
  }
  return {
    sib: function(indice) {
      indice = parseInt(indice)
      path = path.concat([PK.SIB.KEY, indice & 255, (indice >> 8) & 255])
      return this 
    },
    parent: function() {
      path = path.concat([PK.PARENT.KEY, 0, 0]) // trailing zeros for packet space to write back
      return this 
    },
    child: function(indice) {
      indice = parseInt(indice)
      path = path.concat([PK.CHILD.KEY, indice & 255, (indice >> 8) & 255])
      return this
    },
    pfwd: function() {
      path = path.concat([PK.PFWD.KEY])
      return this 
    },
    bfwd: function(indice){
      indice = parseInt(indice)
      path = path.concat([PK.BFWD.KEY, indice & 255, (indice >> 8) & 255])
      return this 
    },
    end: function(segsize = 512, scope = false) {
      segsize = parseInt(segsize)
      if(!scope){ // most packets go to 'dest' - and include the route segsize 
        path = path.concat([PK.DEST, segsize & 255, (segsize >> 8) & 255])
        return path   
      } else {    // packets for 'scope' keys are outside of the dest switch 
        return path
      }
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

let decoder = new TextDecoder()
let tempRead = {} 

TS.read = (type, buffer, start) => {
  switch (type) {
    case 'int32':
      tempRead = new Uint8Array(buffer)
      return new Int32Array(tempRead.slice(start, start + 4).buffer)[0]
      //return (buffer[start] & 255) | (buffer[start + 1] << 8) | (buffer[start + 2] << 16) | (buffer[start + 3] << 24)
    case 'uint8':
      return buffer[start]
    case 'int16':
      tempRead = new Uint8Array(buffer)
      return new Int16Array(tempRead.slice(start, start + 2).buffer)[0]
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
      tempRead = new Uint8Array(buffer)
      return new Float32Array(tempRead.slice(start, start + 4).buffer)[0]
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
