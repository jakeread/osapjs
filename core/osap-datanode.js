/*
osap-datanode.js

prototype software api for network data objects

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, DK, EP, TS, TIMES } from './ts.js'

export default function DataNode(osap){
    this.onData = (data) => {
        console.error('onData method not attached')
    }
}