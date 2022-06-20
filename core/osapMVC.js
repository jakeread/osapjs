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

  // request to add a new route to an endpoint... 
  this.setEndpointRoute = async (routeToEndpoint, routeFromEndpoint, routeMode) => {
    console.error(`MVC Call setEndpointRoute not yet adjusted for new-transport`)
    // ok we dooooo
    await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
    // hit the gram: route + dest:1 + segsize:2 + ROUTESET:1 + RSID:1 + MODE:1 + LEN:1 + routeToSet
    let datagram = new Uint8Array(routeToEndpoint.length + 7 + routeFromEndpoint.length)
    datagram.set(routeToEndpoint, 0)
    let rteLen = routeToEndpoint.length
    datagram[rteLen] = PK.DEST
    datagram[rteLen + 1] = 0; datagram[rteLen + 2] = 2;
    datagram[rteLen + 3] = EP.ROUTE_SET
    datagram[rteLen + 4] = getNewRouteReqID()
    if (routeMode == "ackless") { // so we'll default to acks... 
      datagram[rteLen + 5] = EP.ROUTEMODE_ACKLESS
    } else {
      datagram[rteLen + 5] = EP.ROUTEMODE_ACKED
    }
    datagram[rteLen + 6] = routeFromEndpoint.length
    datagram.set(routeFromEndpoint, rteLen + 7)
    // ship it 
    osap.handle(datagram, VT.STACK_ORIGIN)
    // setup handler 
    return new Promise((resolve, reject) => {
      queriesAwaiting.push({
        request: new Uint8Array(datagram),
        id: datagram[rteLen + 4],
        timeout: setTimeout(() => {
          reject(`route set req timeout`)
        }, ROUTEREQ_MAX_TIME),
        onResponse: function (data, ptr) {
          if (data[ptr + 1]) {
            resolve()
          } else {
            reject(`badness error code ${data[ptr + 1]} from endpoint, on try-to-set-new-route`)
          }
        }
      })
    })
  }

  this.removeEndpointRoute = async (routeToEndpoint, indice) => {
    console.error(`MVC Call setEndpointRoute not yet adjusted for new-transport`)
    await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
    // +3 for dest / segsize, + ROUTERM:1, RSID:1, INDICE:1 
    let datagram = new Uint8Array(routeToEndpoint.length + 6)
    datagram.set(routeToEndpoint, 0)
    let rteLen = routeToEndpoint.length
    datagram[rteLen] = PK.DEST
    datagram[rteLen + 1] = 0; datagram[rteLen + 2] = 2;
    datagram[rteLen + 3] = EP.ROUTE_RM
    datagram[rteLen + 4] = getNewRouteReqID()
    datagram[rteLen + 5] = parseInt(indice)
    // ok, 
    osap.handle(datagram, VT.STACK_ORIGIN)
    // setup handler, 
    return new Promise((resolve, reject) => {
      queriesAwaiting.push({
        request: new Uint8Array(datagram),
        id: datagram[rteLen + 4],
        timeout: setTimeout(() => {
          reject('route rm req timeout')
        }, ROUTEREQ_MAX_TIME),
        onResponse: function (data, ptr) {
          if (data[ptr + 1]) {
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