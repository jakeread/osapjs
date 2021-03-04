/*
osap-utils.js

common packet manipulation routines for OSAP

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK } from "./ts.js"

let ptrLoop = (buffer, ptr) => {
  if (!ptr) ptr = 0

  for (let h = 0; h < 16; h++) {
    switch (buffer[ptr]) {
      case PK.PTR:
        // there it is, 
        return ptr
      case PK.PORTF.KEY:
        // port-previous, keep looking for pointer,
        ptr += PK.PORTF.INC
        break;
      case PK.BUSF.KEY:
      case PK.BUSB.KEY:
        // old instruction to forward on a bus,
        ptr += PK.BUSF.INC
        break;
      case PK.OBJECT.KEY:
        ptr += PK.OBJECT.INC
        break;
      default:
        // unrecognized, escape !
        return undefined 
    }
  } // end ptrloop
}

export { ptrLoop }