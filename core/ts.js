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
  staleTimeout: 600,
  getTimeStamp: function() {return getTimeStamp()}
}

// 13: \r
// 10: \n
// these should be clearly delimited as L1 / L2 possible keys...

// packet keys, for l0 of packets,
// PKEYS all need to be on the same byte order, since they're
// walked
// TRANSPORT LAYER
let PK = {
  PTR: 88,    // packet pointer (next byte is instruction)
  DEST: 99,   // have arrived, (next bytes are for recipient)
  SEARCH: 101,// want to get network topology info. at this knuckle 
  PORTF: {    // forward on this port, 
    KEY: 11,    // actual instruction key,
    INC: 3      // number of bytes in instruction argument + 1 for the key
  },
  BUSF: {     // forward on this bus, to this drop 
    KEY: 12,
    INC: 5
  },
  BUSB: {     // broadcast on this bus, 
    KEY: 14,
    INC: 5,
  },
  DOWN_OBJ: { // traverse up this object, 
    KEY: 21, 
    INC: 3
  },
  UP_OBJ: {
    KEY: 22, 
    INC: 3
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

PK.route = () => {
  let path = []
  return {
    portf: function(exit) {
      path = path.concat([PK.PORTF.KEY, exit & 255, (exit >> 8) & 255])
      return this 
    },
    busf: function(exit, address) {
      path = path.concat([PK.BUSF.KEY, exit & 255, (exit >> 8) & 255, address & 255, (address >> 8) & 255])
      return this 
    },
    up_obj: function(indice) {
      path = path.concat([PK.UP_OBJ.KEY, indice & 255, (indice >> 8) & 255])
      return this
    },
    down_obj: function(indice) {
      path = path.concat([PK.DOWN_OBJ.KEY, indice & 255, (indice >> 8) & 255])
      return this 
    },
    end: function(seg) {
      return {
        path: Uint8Array.from(path), 
        segSize: seg ? seg : 128 // if no segsize defined, use 128 
      }
    }
  }
}

let TS = {}

let decoder = new TextDecoder()

TS.read = (type, buffer, start) => {
  switch (type) {
    case 'uint8':
      return buffer[start]
    case 'uint16':
      // little endian: lsb is at the lowest address
      return (buffer[start] & 255) | (buffer[start + 1] << 8)
    case 'uint32':
      return (buffer[start] & 255) | (buffer[start + 1] << 8) | (buffer[start + 2] << 16) | (buffer[start + 3] << 24)
    case 'float32':
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
  switch (type) {
    case 'uint8':
      buffer[start] = value & 255
      return 1
    case 'uint16':
      // little endian: lsb is at the lowest address
      buffer[start] = value & 255
      buffer[start + 1] = (value >> 8) & 255
      return 2
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
  TIMES
}
