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

export default function OMVC(osap){
  // collects route info for a list of endpoints... 
  this.fillRouteData = (graph) => {
    // make a list of endpoints, 
    let eps = [] 
    let listGenTime = TIMES.getTimeStamp()
    let contextRecursor = (vvt) => {
      // no upwards recurse, 
      if(vvt.lastListGenTime && vvt.lastListGenTime == listGenTime) return;
      vvt.lastListGenTime = listGenTime
      // vvt is a root node in this recursor, we just stuff endpoints into the list:
      for(let child of vvt.children){
        if(child.type == VT.ENDPOINT){
          eps.push(child)
        } else if (child.type == VT.VPORT){
          if(child.reciprocal && child.reciprocal.type != "unreachable"){
            contextRecursor(child.reciprocal.parent)
          }
        }
      }
    }// end context recursor, 
    contextRecursor(graph) 
    return new Promise(async (resolve, reject) => {
      try {
        for(let ep of eps){
          let routes = await this.getEndpointRoutes(ep.route)
          console.warn(`for ${ep.name}, retrieved`, routes)
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
  // ute
  let runningRouteReqID = 112
  let getNewRouteReqID = () => {
    runningRouteReqID ++
    if(runningRouteReqID > 255) runningRouteReqID = 0;
    return runningRouteReqID
  }
  let routeReqsAwaiting = []
  // get route at x indice, 
  this.getEndpointRoutes = async (route) => {
    // alright, do it in a loop until they return an empty array, 
    // also... endpoint route objects, should *not* return the trailing three digits (?) 
    // or should ? the vvt .route object doesn't, 
    try {
      let indice = 0, routes = [] 
      while(true){
        let epRoute = await this.getEndpointRoute(route, indice)
        if(epRoute.length > 0){
          routes[indice] = epRoute 
          indice ++ 
        } else {
          break
        } 
      } // end while 
      return routes 
    } catch (err) {
      // pass it up... 
      console.error(err)
      throw(err) 
    }
  }
  // gets route info for one endpoint,
  this.getEndpointRoute = async (route, indice) => {
    // wait for clear space, 
    await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
    // console.warn('querying to ep at route', route)
    // write a message, here the route doesn't have any tail, so we add
    // + 3 for DEST:1, Segsize:2 
    // + 3 for ROUTEREQ:1, MSGID:1, <Indice> 
    let datagram = new Uint8Array(route.length + 3 + 3)
    datagram.set(route, 0)
    // destination, and *total hack* to assume 512 segsize, badness 
    datagram[route.length] = PK.DEST
    datagram[route.length + 1] = 0; datagram[route.length + 2] = 2; 
    datagram[route.length + 3] = EP.ROUTE_QUERY
    datagram[route.length + 4] = getNewRouteReqID()
    datagram[route.length + 5] = indice // get 0th indice, 
    // ship it 
    osap.handle(datagram, VT.STACK_ORIGIN)
    // setup handler, 
    return new Promise((resolve, reject) => {
      routeReqsAwaiting.push({
        request: datagram.slice(), 
        id: datagram[route.length + 4],
        timeout: setTimeout(() => {
          reject(`route req timeout`)
        }, ROUTEREQ_MAX_TIME),
        onResponse: function (data, ptr) {
          // len is... 
          let routeLen = data[ptr + 1]
          // clear timer, 
          clearTimeout(this.timeout)
          // resolve w/ the route, which should be ptr + 2 -> end of pckt, 
          // which should match the len char... 
          resolve(data.slice(ptr + 2, ptr + 2 + routeLen))
        }
      })
    })
  }// end getEndpoint Route

  this.destHandler = (data, ptr) => {
    // here data[pr] == PK_PTR == 99, so our key is at 
    ptr += 3
    switch(data[ptr]){
      case EP.ROUTE_RESP:
        // match to id, send to handler, carry on... 
        let rqid = data[ptr + 1]
        for(let rqa of routeReqsAwaiting){
          if(rqa.id == rqid){
            rqa.onResponse(data, ptr + 1)
            return true 
          }
        }
        console.error('recvd route_resp, but no matching req awaiting...')
        return true 
      default:
        console.error(`unrecognized key in osap root / mvc dest handler, ${data[ptr]}`)
        return true // clears it 
    }
  }
}