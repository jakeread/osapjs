/*
axlCore.js

axl motion controller central node 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) and AXL projects 
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import PK from '../core/packets.js'
import { TS, EP } from '../core/ts.js'
import TIME from '../core/time.js'

import { settingsDiff } from '../utes/diff.js'

import AXLActuator from './axlActuator.js'

let numDof = 0

// settings... an obj, and _actuators, a list of names & axis-maps... 
export default function AXLCore(osap, _settings, _actuators) {
  // actuators should be... actuator objects, as in axlActuator.js 
  numDof = _settings.bounds.length
  console.warn(`AXL with ${numDof} DOF...`)

  // we have settings that we... diff against these defaults, 
  // defaults, 
  this.settings = {
    junctionDeviation: 0.05,
    queueStartDelay: 500,
    bounds: [100, 100, 100],
    accelLimits: [100, 100, 100],
    velocityLimits: [100, 100, 100]
  }

  // if present, check against 
  if (_settings) {
    settingsDiff(this.settings, _settings, "AXLCore")
    this.settings = JSON.parse(JSON.stringify(_settings))
  }

  // we have actuators, which we'll fill in on setup, 
  let actuators = []

  // ------------------------------------------------------ Inputs and Outputs 
  // ingest moves, 
  // let moveInEP = osap.endpoint("unplannedMoves") 
  // moveInEP.onData = async (data) => {
  //   try {
  //     // TODO here: invent unplanned-move serialization & ingestion... 
  //     // or... leave this off as a js-input that can become something else ? 
  //     await queue.notFull() // lol, idk, 
  //   } catch (err) {
  //     console.error(err)
  //   }
  // }
  // js API... also: our endpoint can just call this, 
  // unplannedMove = { target: [numDof], rate: <num> }

  // ingest halt signals, 
  /*
  #define AXL_HALT_REQUEST 1 
  #define AXL_HALT_CASCADE 2 
  #define AXL_HALT_ACK_NOT_PICKED 3 
  #define AXL_HALT_MOVE_COMPLETE_NOT_PICKED 4
  #define AXL_HALT_BUFFER_STARVED 5
  #define AXL_HALT_OUT_OF_ORDER_ARRIVAL 6
  */
  let haltInEP = osap.endpoint("haltInJS")
  let haltOutEP = osap.endpoint("haltOutJS")
  haltInEP.onData = (data) => {
    // TODO here: ingest string halting-reason-message, 
    // then mirror-out, 
    let message = ""
    switch (data[0]) {
      case 1:
        message = "on request"
        break;
      case 2:
        message = "on cascade"
        break;
      case 3:
        message = "on missed remote ack tx"
        break;
      case 4:
        message = "on missed remote move complete tx"
        break;
      case 5:
        message = "on remote buffer starvation"
        break;
      case 6:
        message = "on out of order arrival"
        break;
      default:
        message = "on uknown halt code (!)"
        break;
    }
    let str = TS.read("string", data, 1).value
    console.error(`HALT! ${message} ${str}`)
    queueState = QUEUE_STATE_HALTED
    //haltOutEP.write("_") // if !halted already, send a pozi edge, if halted, donot repeat msg 
  }

  // planned-move outputs, 
  let plannedMovesOutEP = osap.endpoint("plannedMovesOut")
  // segment complete back 
  let segmentCompleteInEP = osap.endpoint("segmentCompleteIn")
  segmentCompleteInEP.onData = (data) => {
    // console.warn(`received queue complete at ${TIME.getTimeStamp()}`, data)
    let msgSegmentNumber = TS.read('uint32', data, 0)
    let msgActuatorID = TS.read('uint8', data, 4)
    // console.log(`segNum; ${msgSegmentNumber}, actuID; ${msgActuatorID}`)
    // find eeeet, and it should always be the most recent, right?
    if(queue[0].segmentNumber != msgSegmentNumber){
      throw new Error(`! retrieved out-of-order segmentComplete msg, probable failure?`)
    } else {
      // get stats... 
      let outTime = TIME.getTimeStamp() - queue[0].transmitTime 
      console.warn(`segmentComplete ${msgSegmentNumber}, outTime was ${outTime}ms`)
      queue.shift() 
      checkQueueState()
    }
  }
  // segment ack back
  let segmentAckInEP = osap.endpoint("segmentAckIn")
  segmentAckInEP.onData = (data) => {
    // console.warn(`received queue ack at ${TIME.getTimeStamp()}`, data)
    let msgSegmentNumber = TS.read('uint32', data, 0)
    let msgActuatorID = TS.read('uint8', data, 4)
    // we could ask for more data here... like current state ?
    // or / we should combine current state w/ these... i.e. some policy like:
    // at-least once / 10ms we (1) get state from a drop or (2) rx one of these messages, which includes state... 
    // which is this ?
    for(let m in queue){
      if(queue[m].segmentNumber == msgSegmentNumber){
        let rtt = TIME.getTimeStamp() - queue[m].transmitTime 
        console.warn(`segmentAck ${msgSegmentNumber}, rtt was ${rtt}ms`)
        return 
      }
    }
    throw new Error(`apparently no match for ${msgSegmentNumber}`)
  }

  // would do one of these each for actuators, right? 
  let actuatorStateEP = osap.endpoint("stateInput")
  actuatorStateEP.onData = (data) => {
    console.warn(`received actuator data`, data)
  }

  // ------------------------------------------------------ Plumbing

  this.setup = async () => {
    // first we want a graph... 
    try {
      // ---------------------------------------- Get a Graph Object 
      console.log(`SETUP: collecting a graph...`)
      let graph = await osap.nr.sweep()
      // ---------------------------------------- Find and build Actuators 
      for (let actu of _actuators) {
        console.log(`SETUP: looking for ${actu.name}...`)
        let vvt = await osap.nr.find(actu.name, graph)
        // these have settings, some of which are inherited from us, others from the list... 
        let actuSettings = {
          name: actu.name,
          accelLimits: JSON.parse(JSON.stringify((this.settings.accelLimits))),
          velocityLimits: JSON.parse(JSON.stringify((this.settings.velocityLimits))),
          queueStartDelay: this.settings.queueStartDelay,
          actuatorID: actuators.length,
          axis: actu.axis,
          invert: actu.invert,
          microstep: actu.microstep,
          spu: actu.spu,
          cscale: actu.cscale
        }
        actuators.push(new AXLActuator(osap, PK.VC2VMRoute(vvt.route), actuSettings))
        console.log(`SETUP: found and built ${actu.name}...`)
      }
      // then set 'em up, 
      for (let actu of actuators) {
        console.log(`SETUP: initializing ${actu.settings.name}...`)
        await actu.setup()
        console.log(`SETUP: init ${actu.settings.name} OK`)
      }
      // ---------------------------------------- Plumb planned moves -> queue ingestion 
      console.log(`SETUP: building a broadcast route for planned moves...`)
      let plannedMoveChannel = await osap.hl.buildBroadcastRoute(
        "ep_plannedMovesOut",
        [
          "rt_axl-stepper_z"
        ],
        "ep_plannedMovesIn",
        false,
        graph
      )
      console.log(`SETUP: broadcast route for planned moves on ${plannedMoveChannel} OK`)
      // ---------------------------------------- Plumb halt signals from us down to actuators 
      console.log(`SETUP: building a broadcast route for halt signals...`)
      let haltChannel = await osap.hl.buildBroadcastRoute(
        "ep_haltOutJS",
        [
          "rt_axl-stepper_z"
        ],
        "ep_haltIn",
        false,
        graph
      )
      console.log(`SETUP: broadcast route for planned moves on ${haltChannel} OK`)
      // ---------------------------------------- Plumb halt signals from actuators back to us, 
      console.log(`SETUP: linking remote halts back to us...`)
      let haltInVVT = await osap.nr.find("ep_haltInJS", graph)
      for (let actu of actuators) {
        let haltOutVVT = await osap.nr.findWithin("ep_haltOut", actu.settings.name, graph)
        let haltConnectRoute = await osap.nr.findRoute(haltOutVVT, haltInVVT)
        // this should be high(er) priority than queue acks... set time-to-live low-ish 
        haltConnectRoute.ttl = 500
        haltConnectRoute.mode = EP.ROUTEMODE_ACKLESS 
        await osap.mvc.setEndpointRoute(haltOutVVT.route, haltConnectRoute)
        console.log(`SETUP: connected ${actu.settings.name} haltOut to JS`)
      }
      console.warn(`SETUP: TODO: link remote halts to the broadcast as well !`)
      // ---------------------------------------- Plumb actuator queue-acks to us... 
      console.log(`SETUP: linking remote segmentAck signals back to us...`)
      let segmentAckInVVT = await osap.nr.find("ep_segmentAckIn", graph)
      for (let actu of actuators) {
        let segmentAckOutVVT = await osap.nr.findWithin("ep_segmentAckOut", actu.settings.name, graph)
        let connectRoute = await osap.nr.findRoute(segmentAckOutVVT, segmentAckInVVT)
        // lower priority than halt signals, but higher than general purpose 
        connectRoute.ttl = 750
        connectRoute.mode = EP.ROUTEMODE_ACKLESS 
        await osap.mvc.setEndpointRoute(segmentAckOutVVT.route, connectRoute)
        console.log(`SETUP: connected ${actu.settings.name} segmentAck to JS`)
      }
      console.log(`SETUP: queue signals are piped...`)
      // ---------------------------------------- Plumb actuator queue-move-complete to us...
      console.log(`SETUP: linking remote segmentComplete signals back to us...`)
      let segmentCompleteInVVT = await osap.nr.find("ep_segmentCompleteIn", graph)
      for (let actu of actuators) {
        let segmentCompletOutVVT = await osap.nr.findWithin("ep_segmentCompleteOut", actu.settings.name, graph)
        let connectRoute = await osap.nr.findRoute(segmentCompletOutVVT, segmentCompleteInVVT)
        // lower priority than halt signals, but higher than general purpose 
        connectRoute.ttl = 750
        connectRoute.mode = EP.ROUTEMODE_ACKLESS 
        await osap.mvc.setEndpointRoute(segmentCompletOutVVT.route, connectRoute)
        console.log(`SETUP: connected ${actu.settings.name} segmentComplete to JS`)
      }
      console.log(`SETUP: queue complete are piped...`)
      // ---------------------------------------- END 
    } catch (err) {
      throw err
    }
    /* 
    (1) setup each actuator, right? 
    (2) setup check SPU & over-ticking... or is that motor responsibility ? 
    (3) plumb our moveOutEP to broadcast to actuator inputs, 
    (4) plumb state update request EP likewise... 
    (5) plumb our stateOutEP likewise... 
    */
  }

  // ------------------------------------------------------ Queue Updates 

  let QUEUE_STATE_EMPTY = 1
  let QUEUE_STATE_AWAITING_START = 2
  let QUEUE_STATE_RUNNING = 3
  let QUEUE_STATE_HALTED = 4

  let AXL_REMOTE_QUEUE_MAX_LENGTH = 32

  // we have a queue of moves... 
  let queue = []
  let maxQueueLength = 128
  let jsQueueStartDelay = 1000
  let queueState = QUEUE_STATE_EMPTY
  let nextSegmentNumber = 0

  this.addMoveToQueue = async (unplannedMove) => {
    return new Promise((resolve, reject) => {
      let check = async () => {
        if (queue.length < maxQueueLength) {
          // ingest it here... 
          let segment = {
            endPos: unplannedMove.target,     // where togo 
            vi: 1.0,                          // start... 
            accel: 500,                       // accel-rate 
            vmax: unplannedMove.rate,         // max-rate
            vf: 1.0,                          // end-rate 
            segmentNumber: nextSegmentNumber, // # in infinite queue
            returnActuator: 0,                // which actuator should ack us... this should be rolling as well, 
            transmitTime: 0,                  // when did it depart... (for JS, not serialized)
          }
          // increment this... 
          nextSegmentNumber++
          // we need a distance and unit vector, so we need to know previous, 
          let previous = {}
          if (queue[queue.length - 1]) {
            previous = queue[queue.length - 1]
          } else {
            previous = {
              endPos: [0, 0, 0],  // just... dummy for now, 
              vf: 0.0
            }
          }
          segment.distance = distance(previous.endPos, segment.endPos)
          segment.unitVector = unitVector(previous.endPos, segment.endPos)
          // console.log(`from `, previous.endPos, `to `, segment.endPos, `dist ${dist.toFixed(2)}`, unit)
          // can calculate distance, deltas, and unit vector... 
          queue.push(segment)
          // console.warn(`AXL Core ingests ${queue.length} / ${maxQueueLength}`)
          // this is async because it transmits out the other end... 
          checkQueueState().then(() => {
            resolve()
          }).catch((err) => {
            reject(err)
          })
        } else {
          setTimeout(check, 0)
        }
      }
      check()
    })
  }

  let checkQueueState = async () => {
    try {
      switch (queueState) {
        case QUEUE_STATE_EMPTY:
          if (queue.length > 0) {
            queueState = QUEUE_STATE_AWAITING_START
            setTimeout(() => {
              console.warn(`QUEUE START FROM AWAITING...`)
              queueState = QUEUE_STATE_RUNNING
              checkQueueState()
            }, jsQueueStartDelay)
          }
          break;
        case QUEUE_STATE_AWAITING_START:
          // noop, wait for timer... 
          break;
        case QUEUE_STATE_RUNNING:
          // can we publish, do we have unplanned, etc?
          console.warn(`QUEUE RUNNING...`)
          // so we'll try to transmit up to 32 ? and just stuff 'em unapologetically into the buffer, leggo: 
          for (let m = 0; m < AXL_REMOTE_QUEUE_MAX_LENGTH - 1; m++) {
            if (!queue[m]) {
              console.warn(`breaking because not-even-32-items here...`)
            }
            if (queue[m].transmitTime == 0) {
              console.log(`tx'd item at ${m}, segment ${queue[m].segmentNumber}`)
              await transmitSegment(queue[m])
            }
          }
          break;
        case QUEUE_STATE_HALTED:
          console.warn(`halted, exiting...`)
          break;
        default:
          console.error(`unknown state...`)
          break;
      } // end switch 
    } catch (err) {
      throw err
    }
  }

  let transmitSegment = async (seg) => {
    try {
      // then... serialize and transmit it, right?
      let datagram = new Uint8Array(4 + 1 + numDof * 4 + 5 * 4)
      let wptr = 0
      // segnum, return actuator, unit vect, vi, accel, vmax, vf, distance, done 
      wptr += TS.write("uint32", seg.segmentNumber, datagram, wptr)
      wptr += TS.write("uint8", seg.returnActuator, datagram, wptr)
      for (let a = 0; a < numDof; a++) {
        wptr += TS.write("float32", seg.unitVector[a], datagram, wptr)
      }
      wptr += TS.write("float32", seg.vi, datagram, wptr)
      wptr += TS.write("float32", seg.accel, datagram, wptr)
      wptr += TS.write("float32", seg.vmax, datagram, wptr)
      wptr += TS.write("float32", seg.vf, datagram, wptr)
      wptr += TS.write("float32", seg.distance, datagram, wptr)
      // write that, ackless, to the pmo
      await plannedMovesOutEP.write(datagram)
      seg.transmitTime = TIME.getTimeStamp()
      console.warn(`TX'd ${seg.segmentNumber} at ${seg.transmitTime}`)
      // HERE is an OSAP TODO, which causes us to loose ~ ms of performance: because 
      // time stamps in packets are ms-based, we can't send multiple packets in the same `ms` 
      // while also retaining FIFO-ness. We should rather have ns, us, and ms in the transport layer timestamps... 
      // so do some analysis on data lengths etc (max packet life? min gap?) and also see how to get 
      // ns times in JS, etc... 
      await TIME.delay(0)
    } catch (err) {
      throw err
    }
  }

  let runQueueOptimization = () => {

  }

}

// ------------------------------------ Planning... Utes?

/*
// given accel, final rate, and distance, how big is vi?
float maxVi(float accel, float vf, float distance){
  //OSAP::debug(String(accel) + " " + String(vf) + " " + String(distance));
  return sqrtf(vf * vf - 2.0F * accel * distance);
}
*/

// between A and B 
let distance = (A, B) => {
  let sum = 0
  for (let a = 0; a < numDof; a++) {
    sum += Math.pow((A[a] - B[a]), 2)
  }
  return Math.sqrt(sum)
}

// from A to B 
let unitVector = (A, B) => {
  let dist = distance(A, B)
  let unit = new Array(numDof)
  for (let a = 0; a < numDof; a++) {
    unit[a] = (B[a] - A[a]) / dist
  }
  return unit
}