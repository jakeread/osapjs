/*
minimalVirtualMachine.js

example 'virtual machine' 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, TS, VT, EP, TIMES } from '../../osapjs/core/ts.js'
import MotionVM from './motionVirtualMachine.js'
import MotorVM from './motorVirtualMachine.js'

export default function MinVM(osap) {

  // ------------------------------------------------------ NET LOCATION OF BUS HEAD 

  let headRoute = PK.route().sib(0).pfwd().sib(1).pfwd().end()

  // position after-homing:
  // since we home to top-right, bottom-left is 0,0,0
  // and we have bounding box then... 
  let posOnHome = {
    X: 100,     // about 0->130mm x should be safe,
    Y: 100,     // about 0->170mm y should be safe
    Z: 100       // 260mm tall max, abt 
  }

  // ------------------------------------------------------ MOTION
  // with base route -> embedded smoothie instance 
  this.motion = new MotionVM(osap, headRoute)

  // .settings() for rates and accels, 
  this.motion.settings({
    accel: {  // mm/sec^2 
      X: 500,   // 1500
      Y: 500,   // 1500
      Z: 250,   // 300, 
      E: 150    // 500 
    },
    maxRate: {  // mm/sec 
      X: 400,   // 100
      Y: 400,   // 100 
      Z: 100,   // 50 
      E: 50     // 100 
    },
    spu: {
      X: 40, 
      Y: 40, 
      Z: 40, 
      E: 100 
    }
  })

  // ------------------------------------------------------ MOTORS

  this.motors = {
    X: new MotorVM(osap, PK.route(headRoute).sib(1).bfwd(2).end()),
  }

  // .settings() just preps for the .init() or whatever other call, 
  this.motors.X.settings({
    axisPick: 0,
    axisInversion: false,
    microstep: 4,         // 
    currentScale: 0.4,    // 0 -> 1 
    homeRate: -1000,      // steps / sec 
    homeOffset: 2000,     // steps 
  })

  // ------------------------------------------------------ setup / handle motor group

  this.setupMotors = async () => {
    for (let mot in this.motors) {
      try {
        await this.motors[mot].setup()
      } catch (err) {
        console.error(`failed to setup ${mot}`)
        throw err
      }
    }
  }

  this.enableMotors = async () => {
    for (let mot in this.motors) {
      try {
        await this.motors[mot].enable()
      } catch (err) {
        console.error(`failed to enable ${mot}`)
        throw err
      }
    }
  }

  this.disableMotors = async () => {
    for (let mot in this.motors) {
      try {
        await this.motors[mot].disable()
      } catch (err) {
        console.error(`failed to disable ${mot}`)
        throw err
      }
    }
  }

  // ------------------------------------------------------ HOMING 

  this.homeZ = async () => {
    try {
      await this.motion.awaitMotionEnd()
      if (this.motors.Z) {
        await this.motors.Z.home()
        await this.motors.Z.awaitHomeComplete()
      } else {
        console.warn("on clank.homeZ, no z motor... passing...")
      }
    } catch (err) { throw err }
  }

  this.homeXY = async () => {
    try {
      await this.motion.awaitMotionEnd()
      await this.motors.X.home()
      await this.motors.X.awaitHomeComplete()
      /*
      if (this.motors.X) await this.motors.X.home()
      if (this.motors.YL) await this.motors.YL.home()
      if (this.motors.YR) await this.motors.YR.home()
      if (this.motors.X) await this.motors.X.awaitHomeComplete()
      if (this.motors.YL) await this.motors.YL.awaitHomeComplete()
      if (this.motors.YR) await this.motors.YR.awaitHomeComplete()
      */
    } catch (err) { throw err }
  }

  this.home = async () => {
    try {
      await this.homeZ()
      await this.homeXY()
      await this.motion.setPos(posOnHome)
    } catch (err) { throw err }
  }

} // end clank vm 