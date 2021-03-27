/*
osap-query.js

software API for queries on remote elements 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, DK, EP, TS, TIMES } from './ts.js'

export default function Query(osap, path, endpoint, segsize) {
  // local copy, 
  this.data = null
  // posns
  this.indice = 0
  // lookup 
  this.id = 0 

  // full route object, 
  this.route = {
    path: path,
    segsize: segsize 
  }

  this.endpoint = endpoint 

  // header, when we transmit 
  let header = new Uint8Array(7)
  header[0] = DK.VMODULE_QUERY;
  header[1] = 0; header[2] = 0; // this will be filled in w/ qid 
  header[3] = this.endpoint[1]; header[4] = this.endpoint[2] // virtual module to q 
  header[5] = this.endpoint[3]; header[6] = this.endpoint[4];

  // the action 
  this.getLatest = () => { return this.data }
  // net query 
  this.pull = () => {
    // transmit a request, 
    return new Promise((resolve, reject) => {
      // write a new request ID
      this.id = osap.getNewQueryID()
      TS.write('uint16', this.id, header, 1, true)
      // ship it 
      osap.send(this.route, header).then(() => {
        setTimeout(() => {
          reject(`timeout to ${this.route.path} for id ${this.id}`)
        }, TIMES.endpointQueryTimeout)
      }).catch((err) => {
        reject(err)
      })
      // the handler 
      this.callback = resolve 
    })
  }
}