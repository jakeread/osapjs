/*
osapQueryMSeg.js

resolves remote data for local code, big chonkers 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, EPMSEG, TIMES } from './ts.js'
import Vertex from './osapVertex.js'

export default class QueryMSeg extends Vertex {
  constructor(parent, indice, route, retries) {
    super(parent, indice)
    this.route = route 
    this.maxRetries = retries 
  }

  // ---------------------------------- Catch Side 

  destHandler = function (data, ptr) {
    console.log('mseg dest handler', data, ptr)
    return true 
  }

  pull = () => {
    return new Promise((resolve, reject) => {
      resolve('msegq pull')
    })
  }
}