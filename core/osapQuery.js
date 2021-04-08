/*
osapQuery.js

resolves remote data for local code 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, EP, TIMES } from './ts.js'

export default class Query {
  constructor(parent, route) {
    this.parent = parent
    // bit of a hack: mod route to traverse parent -> child, 
    // for better inheritence w/ endpoints 
    this.route = route
    this.route[1] = PK.CHILD.KEY
    console.log(`query route`, route)
  }

  queryAwaiting = null

  pull = () => {
    return new Promise((resolve, reject) => {
      if (this.queryAwaiting) {
        reject("already awaiting on this line")
      } else {
        let queryId = this.parent.getNewQueryId()
        let req = new Uint8Array(this.route.length + 2)
        req.set(this.route, 0)
        req[this.route.length] = EP.QUERY
        req[this.route.length + 1] = queryId
        this.queryAwaiting = {
          id: queryId,
          resolve: resolve,
          timeout: setTimeout(() => {
            this.queryAwaiting = null
            reject('query timeout')
          }, TIMES.staleTimeout)
        }
        // parent handles,
        this.parent.handle(req, 0)
      }
    })
  }
}