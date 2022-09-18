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
import { TS, VT } from '../core/ts.js'
import TIME from '../core/time.js'

import { settingsDiff } from '../utes/diff.js'

import AXLActuator from './axlActuator.js'

// settings... an obj, and _actuators, a list of names & axis-maps... 
export default function AXLCore(osap, _settings, _actuators) {
  // actuators should be... actuator objects, as in axlActuator.js 
  let numDof = _settings.bounds.length
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

  // we have a queue of moves... 
  let queue = []
  let maxQueueLength = 128

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
  this.addMoveToQueue = async (unplannedMove) => {
    return new Promise((resolve, reject) => {
      let check = () => {
        if (queue.length < maxQueueLength) {
          queue.push({
            endPos: unplannedMove.target,
            vmax: unplannedMove.rate,
            // etc...  
          })
          console.log(`AXL Core Ingests; ${queue.length} / ${maxQueueLength}`)
          runQueueOptimization()
          resolve()
        } else {
          setTimeout(check, 0)
        }
      }
      check()
    })
  }

  // ingest halt signals, 
  let haltInEP = osap.endpoint("haltInJS")
  let haltOutEP = osap.endpoint("haltOutJS")
  haltInEP.onData = (data) => {
    // TODO here: ingest string halting-reason-message, 
    // then mirror-out, 
    console.error("HALT!")
    haltOutEP.write("_") // if !halted already, send a pozi edge, if halted, donot repeat msg 
  }

  // planned-move outputs, 
  let moveOutEP = osap.endpoint("plannedMovesOut")
  // queue info back, 
  let queueAckInEP = osap.endpoint("queueAckIn")
  queueAckInEP.onData = (data) => {
    console.warn(`receveid queue ack!`, data)
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
      for(let actu of actuators){
        let haltOutVVT = await osap.nr.findWithin("ep_haltOut", actu.settings.name, graph)
        let haltConnectRoute = await osap.nr.findRoute(haltOutVVT, haltInVVT)
        // this should be high(er) priority than queue acks... set time-to-live low-ish 
        haltConnectRoute.ttl = 250 
        await osap.mvc.setEndpointRoute(haltOutVVT.route, haltConnectRoute)
        console.log(`SETUP: connected ${actu.settings.name} haltOut to JS`)
      }
      console.warn(`SETUP: TODO: link remote halts to the broadcast as well !`)
      // ---------------------------------------- Plumb actuator queue-acks to us... 
      console.log(`SETUP: linking remote queue signals back to us...`)
      let queueAckInVVT = await osap.nr.find("ep_queueAckIn", graph)
      for(let actu of actuators){
        let queueAckOutVVT = await osap.nr.findWithin("ep_queueAckOut", actu.settings.name, graph)
        let queueConnectRoute = await osap.nr.findRoute(queueAckOutVVT, queueAckInVVT)
        // lower priority than halt signals, but higher than general purpose 
        queueConnectRoute.ttl = 500 
        await osap.mvc.setEndpointRoute(queueAckOutVVT.route, queueConnectRoute)
        console.log(`SETUP: connected ${actu.settings.name} queueOut to JS`)
      }
      console.log(`SETUP: queue signals are piped...`)
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