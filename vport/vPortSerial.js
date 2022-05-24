/*
vPortSerial.js

link layer 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { SerialPort, DelimiterParser } from 'serialport'
import { TS } from '../core/ts.js'
import COBS from "../utes/cobs.js"

// have some "protocol" at the link layer 
// buffer is max 256 long for that sweet sweet uint8_t alignment 
let SERLINK_BUFSIZE = 255
// -1 checksum, -1 packet id, -1 packet type, -2 cobs
let SERLINK_SEGSIZE = SERLINK_BUFSIZE - 5
// packet keys; 
let SERLINK_KEY_PCK = 170  // 0b10101010
let SERLINK_KEY_ACK = 171  // 0b10101011
let SERLINK_KEY_DBG = 172
// retry settings 
let SERLINK_RETRY_MACOUNT = 2
let SERLINK_RETRY_TIME = 100  // milliseconds  

export default function VPortSerial(osap, portName, debug = false) {
  // track la, 
  this.portName = portName
  // make the vport object (will auto attach to osap)
  let vport = osap.vPort(`vport_${this.portName}`)
  vport.maxSegLength = 255 
  // open the port itself, 
  if (debug) console.log(`SERPORT contact at ${this.portName}, opening`)
  // we keep a little state, as a treat 
  let outAwaiting = null
  let outAwaitingId = 1
  let outAwaitingTimer = null
  let numRetries = 0
  let lastIdRxd = 0
  // flowcontrol is based on this state, 
  this.status = "opening"
  let flowCondition = () => {
    return (outAwaiting == null)
  }
  vport.cts = () => {
    if (this.status == "open" && flowCondition()) {
      return true
    } else {
      return false
    }
  }
  // we have a port... 
  let port = new SerialPort({
    path: this.portName,
    baudRate: 9600
  })
  port.on('open', () => {
    // we track remote open spaces, this is stateful per link... 
    console.log(`SERPORT at ${this.portName} OPEN`)
    // is now open,
    this.status = "open"
    // to get, use delimiter
    let parser = port.pipe(new DelimiterParser({ delimiter: [0] }))
    //let parser = port.pipe(new ByteLength({ length: 1 }))
    // implement rx
    parser.on('data', (buf) => {
      if (debug) console.log('SERPORT Rx', buf)
      // checksum... 
      if (buf.length + 1 != buf[0]) {
        console.log(`SERPORT Rx Bad Checksum, ${buf[0]} reported, ${buf.length} received`)
        return
      }
      // ack / pack: check and clear, or noop 
      if (buf[1] == SERLINK_KEY_ACK) {
        if (buf[2] == outAwaitingId) {
          outAwaiting = null
        }
      } else if (buf[1] == SERLINK_KEY_PCK) {
        if (buf[2] == lastIdRxd) {
          console.log(`SERPORT Rx double id`)
          return
        } else {
          lastIdRxd = buf[2]
          let decoded = COBS.decode(buf.slice(3))
          vport.awaitStackAvailableSpace(0, 2000).then(() => {
            //console.log('SERPORT RX Decoded', decoded)
            vport.receive(decoded)
            // output an ack, 
            let ack = new Uint8Array(4)
            ack[0] = 4
            ack[1] = SERLINK_KEY_ACK
            ack[2] = lastIdRxd
            ack[3] = 0
            port.write(ack)
          })
        }
      } else if (buf[1] == SERLINK_KEY_DBG) {
        let decoded = COBS.decode(buf.slice(2))
        let str = TS.read('string', decoded, 0, true).value; console.log("LL: ", str);
      }
    })
    // implement tx
    vport.send = (buffer) => {
      // double guard, idk
      if (!flowCondition()) return;
      // buffers, uint8arrays, all the same afaik 
      // we are len + cobs start + cobs delimit + pck/ack + id + checksum ? 
      outAwaiting = new Uint8Array(buffer.length + 5)
      outAwaiting[0] = buffer.length + 5
      outAwaiting[1] = SERLINK_KEY_PCK
      outAwaitingId++; if (outAwaitingId > 255) outAwaitingId = 1;
      outAwaiting[2] = outAwaitingId
      outAwaiting.set(COBS.encode(buffer), 3)
      // this is for the 64-byte long bug, i.e. when a packet is exactly 64 bytes 
      // there is (I think) an arduino cdc implementation error that prevents the 
      // 64th byte from reading in, so we append...
      if(outAwaiting.length == 64){
        console.warn("64 bytes message, potential bugfarm, injecting +1 0")
        let newAwaiting = new Uint8Array(65)
        newAwaiting.set(outAwaiting)
        newAwaiting[63] = 1
        newAwaiting[64] = 0
        newAwaiting[0] = 65
        outAwaiting = newAwaiting
      }
      // reset retry states 
      clearTimeout(outAwaitingTimer)
      numRetries = 0
      // ship eeeet 
      if (debug) console.log('SERPORT Tx', outAwaiting)
      port.write(outAwaiting)
      // retry timeout, in reality USB is robust enough, but codes sometimes bungle messages too 
      outAwaitingTimer = setTimeout(() => {
        if (outAwaiting && numRetries < SERLINK_RETRY_MACOUNT && port.isOpen) {
          port.write(outAwaiting)
          numRetries++
        } else if (!outAwaiting) {
          // noop
        } else {
          // cancel 
          outAwaiting = null
        }
      }, SERLINK_RETRY_TIME)
    }
  }) // end on-open
  // close on errors, 
  port.on('error', (err) => {
    this.status = "closing"
    console.log(`SERPORT ${this.portName} ERR`, err)
    if(port.isOpen) port.close()
  })
  port.on('close', (evt) => {
    vport.dissolve()
    console.log(`SERPORT ${this.portName} closed`)
    this.status = "closed"
  })
}