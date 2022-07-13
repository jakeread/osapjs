/*
motionHead.js

motion-head firmware mirror 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import PK from "../core/packets.js"
import AXLMotionVM from "../vms/axlMotionVM.js"
import VC from "./vc.js"

export default function MotionHead(osap, _settings) {
  this.vc = new VC(osap, "rt_motion-head")
  this.setup = async () => {
    try {
      await this.vc.setup()
      console.log(`found motion-head fw, now loading settings`)
      console.warn(`haven't written settings-diff yet...`)
      this.motion = new AXLMotionVM(osap, this.vc.route, _settings.accelLimits.length)
      this.motion.settings = _settings
      await this.motion.setup()
      console.log(`motion-head setup OK`)
    } catch (err) {
      console.error(err)
      throw err 
    }
  }
  // 
}