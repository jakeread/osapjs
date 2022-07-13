/*
vs.js

virtual context base class, 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

export default function VC(osap, name) {
  // setup is async,
  this.setup = async () => {
    // find self via name & netRunner lookup,
    try {
      let vvt = await osap.nr.stringLookup(name)
      this.route = vvt.route
    } catch (err) {
      console.error(`failed to setup the VC with name ${name}`)
      console.error(err)
    }
  }
}