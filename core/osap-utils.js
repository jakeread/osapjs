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
        return ptr
      case PK.SIB.KEY:
        ptr += PK.SIB.INC
        break;
      case PK.PARENT.KEY:
        ptr += PK.PARENT.INC
        break;
      case PK.CHILD.KEY:
        ptr += PK.CHILD.INC
        break;
      case PK.PFWD.KEY:
        ptr += PK.PFWD.INC
        break;
      case PK.BFWD.KEY:
        ptr += PK.BFWD.INC
        break;
      default:
        // unrecognized, escape !
        return undefined
    }
  } // end ptrloop
}

export { ptrLoop }