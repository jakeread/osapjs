/*
osapMVC.js

getters and setters, etc, for remote elements 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, TS, VT, EP, TIMES } from './ts.js'

let ROUTEREQ_MAX_TIME = 1000 // ms 

export default function OMVC(osap) {
  // collects route info for a list of endpoints... 
  this.fillRouteData = (graph) => {
    // make a list of endpoints, 
    let eps = []
    let listGenTime = TIMES.getTimeStamp()
    let contextRecursor = (vvt) => {
      if (!vvt) {
        console.warn('no vvt here on recurse... ?')
        return
      }
      // no upwards recurse, 
      if (vvt.lastListGenTime && vvt.lastListGenTime == listGenTime) return;
      vvt.lastListGenTime = listGenTime
      // vvt is a root node in this recursor, we just stuff endpoints into the list:
      for (let child of vvt.children) {
        if (child.type == VT.ENDPOINT) {
          eps.push(child)
        } else if (child.type == VT.VPORT) {
          if (child.reciprocal && child.reciprocal.type != "unreachable") {
            contextRecursor(child.reciprocal.parent)
          }
        }
      }
    }// end context recursor, 
    contextRecursor(graph)
    return new Promise(async (resolve, reject) => {
      try {
        for (let ep of eps) {
          let routes = await this.getEndpointRoutes(ep.route)
          // console.warn(`for ${ep.name}, retrieved`, routes)
          // attach those to the vvt, pretty simple, right ? 
          ep.routes = routes
        }
        resolve(graph)
      } catch (err) {
        console.error('badness when querying for routes')
        reject(err)
      }
    })
  }
  // msgs all have an ID... we just use one string of 'em, then can easily dispatch callbacks, 
  let runningQueryID = 112 
  let getNewQueryID = () => {
    runningQueryID ++
    runningQueryID = runningQueryID & 0b11111111
    return runningQueryID
  }
  let queriesAwaiting = [] 
  // get route at x indice, 
  this.getEndpointRoutes = async (route) => {
    // alright, do it in a loop until they return an empty array, 
    // also... endpoint route objects, should *not* return the trailing three digits (?) 
    // or should ? the vvt .route object doesn't, 
    try {
      let indice = 0, routes = []
      while (true) {
        let epRoute = await this.getEndpointRoute(route, indice)
        if (epRoute != undefined) {
          routes[indice] = epRoute
          indice++
        } else {
          break
        }
      } // end while 
      return routes
    } catch (err) {
      // pass it up... 
      console.error(err)
      throw (err)
    }
  }
  // gets route info for one endpoint... arg is route-to-endpoint, 
  this.getEndpointRoute = async (route, indice) => {
    // wait for clear space, 
    await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
    // payload is pretty simple, 
    let id = getNewQueryID()
    let payload = new Uint8Array([PK.DEST, EP.ROUTE_QUERY, id, indice])
    let datagram = PK.writeDatagram(route, payload)
    // ship it from the root vertex, 
    osap.handle(datagram, VT.STACK_ORIGIN)
    // setup handler, 
    return new Promise((resolve, reject) => {
      queriesAwaiting.push({
        id: id,
        timeout: setTimeout(() => {
          reject(`route req timeout to ${route.path}`)
        }, ROUTEREQ_MAX_TIME),
        onResponse: function (data) {
          // clear timer, 
          clearTimeout(this.timeout)
          // make a new route object for our caller, 
          let routeMode = data[0]
          // if mode == 0, no route exists at this indice, 
          // otherwise... resolve the route... 
          if(routeMode == 0){
            resolve()
          } else {
            resolve({
              mode: routeMode, 
              ttl: TS.read('uint16', data, 1),
              segSize: TS.read('uint16', data, 3),
              path: new Uint8Array(data.subarray(5))
            })
          }
        }
      })
    })
  }// end getEndpoint Route

  // request to add a new route to an endpoint... set mode via routeFromEndpoint.mode == ... 
  this.setEndpointRoute = async (routeToEndpoint, routeFromEndpoint) => {
    // not all routes have modes, set a default, 
    if(!routeFromEndpoint.mode){ routeFromEndpoint.mode = EP.ROUTEMODE_ACKED }
    // ok we dooooo
    await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
    // similar...
    let id = getNewQueryID()
    // + DEST, + ROUTE_SET, + ID, + Route (route.length + mode + ttl + segsize)
    let payload = new Uint8Array(3 + routeFromEndpoint.path.length + 5)
    payload.set([PK.DEST, EP.ROUTE_SET, id, routeFromEndpoint.mode])
    let wptr = 4
    wptr += TS.write('uint16', routeFromEndpoint.ttl, payload, wptr)
    wptr += TS.write('uint16', routeFromEndpoint.segSize, payload, wptr)
    payload.set(routeFromEndpoint.path, wptr)
    // gram it up, 
    let datagram = PK.writeDatagram(routeToEndpoint, payload)
    // ship it 
    osap.handle(datagram, VT.STACK_ORIGIN)
    // setup handler 
    return new Promise((resolve, reject) => {
      queriesAwaiting.push({
        id: id,
        timeout: setTimeout(() => {
          reject(`route set req timeout`)
        }, ROUTEREQ_MAX_TIME),
        onResponse: function (data) {
          console.warn(`ROUTE SET REPLY`)
          if (data[0]) {
            resolve()
          } else {
            reject(`badness error code ${data} from endpoint, on try-to-set-new-route`)
          }
        }
      })
    })
  }

  this.removeEndpointRoute = async (routeToEndpoint, indice) => {
    await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
    // same energy
    let id = getNewQueryID()
    // + DEST, + ROUTE_RM, + ID, + Indice 
    let payload = new Uint8Array([PK.DEST, EP.ROUTE_RM, id, indice])
    let datagram = PK.writeDatagram(routeToEndpoint, payload)
    osap.handle(datagram, VT.STACK_ORIGIN)
    // setup handler, 
    return new Promise((resolve, reject) => {
      queriesAwaiting.push({
        id: id,
        timeout: setTimeout(() => {
          reject('route rm req timeout')
        }, ROUTEREQ_MAX_TIME),
        onResponse: function (data) {
          if (data[0]) {
            resolve()
          } else {
            reject(`badness error code ${data[ptr + 1]} from endpoint, on try-to-delete-route`)
          }
        }
      })
    })
  }

  this.destHandler = (item, ptr) => {
    // here data[ptr] == PK.PTR, then ptr + 1 is PK.DEST, ptr + 2 is key for us, 
    // ... we could do: 
    // mvc things w/ one attach-and-release reponse handlers and root-unique request IDs, non?
    keySwitch: switch (item.data[ptr + 2]) {
      case EP.ROUTE_RESP:
      case EP.ROUTE_SET_RESP:
      case EP.ROUTE_RM_RESP:
        {
          // match to id, send to handler, carry on... 
          let rqid = item.data[ptr + 3]
          for (let rqa of queriesAwaiting) {
            if (rqa.id == rqid) {
              // do onResponse w/ reply-specific payload... 
              rqa.onResponse(new Uint8Array(item.data.subarray(ptr + 4)))
              break keySwitch;
            }
          }
          // some network retries etc can result in double replies... this is OK, happens... 
          console.warn(`recvd mvc response ${rqid}, but no matching req awaiting... of ${queriesAwaiting.length}`)
          break;
        }
      default:
        console.error(`unrecognized key in osap root / mvc dest handler, ${data[ptr]}`)
    } // end switch, 
    // all mvc replies get *handled* 
    item.handled()
  }
}