/*
osap-endpoint.js

prototype software entry point / network endpoint for osap system

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, DK, EP, TS, TIMES } from './ts.js'

export default function Endpoint(osap){

    // these should be promises (?) not unlike the 'module' inputjs class, 
    this.onData = (data) => {
        console.error('onData method not attached')
    }
}