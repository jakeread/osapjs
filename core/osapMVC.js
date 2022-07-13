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

import { TS, VT, EP } from './ts.js'
import TIME from './time.js'
import PK from './packets.js'

let ROUTEREQ_MAX_TIME = 1000 // ms 

let RT = {
  DBG_STAT: 151,
  DBG_ERRMSG: 152,
  DBG_DBGMSG: 153,
  DBG_RES: 161,
}

export default function OMVC(osap) {
  // ------------------------------------------------------ Query IDs
  // msgs all have an ID... 
  // we just use one string of 'em, then can easily dispatch callbacks, 
  let runningQueryID = 112
  let getNewQueryID = () => {
    runningQueryID++
    runningQueryID = runningQueryID & 0b11111111
    return runningQueryID
  }
  let queriesAwaiting = []
  
  // ------------------------------------------------------ Context Debuggen 
  this.getContextDebug = async (route, stream = "none") => {
    try {
      await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
      let id = getNewQueryID()
      // these are all going to get more or less the same response, 
      let payload = new Uint8Array([PK.DEST, 0, id])
      switch (stream) {
        case "none":
          payload[1] = RT.DBG_STAT
          break;
        case "error":
          payload[1] = RT.DBG_ERRMSG
          break;
        case "debug":
          payload[1] = RT.DBG_DBGMSG
          break;
        default:
          throw new Error("odd stream spec'd for getContextDebug, should be 'error' or 'debug'")
      } // end switch 
      let datagram = PK.writeDatagram(route, payload)
      osap.handle(datagram, VT.STACK_ORIGIN)
      // handler
      return new Promise((resolve, reject) => {
        queriesAwaiting.push({
          id: id,
          timeout: setTimeout(() => {
            reject(`debug collect timeout to ${route.path}`)
          }, 1000),
          onResponse: function (data) {
            clearTimeout(this.timeout)
            let res = {
              loopHighWaterMark: TS.read("uint32", data, 0),
              errorCount: TS.read("uint32", data, 4),
              debugCount: TS.read("uint32", data, 8)
            }
            if (stream != "none") {
              res.msg = TS.read("string", data, 12).value
            }
            resolve(res)
          }
        })
      })
    } catch (err) {
      throw err
    }
  }

  // ------------------------------------------------------ Batch Route Infill 

  this.fillRouteData = async (graph) => {
    try {
      // we'll make lists of endpoints & vbussess, 
      let endpoints = []
      let busses = []
      let vertices = osap.nr.flatten(graph)
      for (let vt of vertices) {
        if (vt.type == VT.ENDPOINT) endpoints.push(vt)
        if (vt.type == VT.VBUS) busses.push(vt)
      }
      // then just get through 'em and collect routes 
      for (let ep of endpoints) {
        let routes = await this.getEndpointRoute(ep.route)
        ep.routes = routes
      }
      for (let vbus of busses) {
        let broadcasts = await this.getVBusBroadcastChannels(vbus.route)
        console.warn(`collected broadcasts;`, broadcasts)
      }
      // we've been editing by reference, so the graph is now 'full' 
      return graph
    } catch (err) {
      throw err
    }
  }

  // ------------------------------------------------------ Per-Endpoint Route List Collection 
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

  // ------------------------------------------------------ Per-VBus Broadcast Collection 
  this.getVBusBroadcastChannels = async (route) => {
    // bus channels are not necessarily stacked up like broadcast channels are, 
    // since i.e. some previosly-configured broadcast is useful on new bus drops, 
    // so we need to first collect a kind of map, not unlike the scope's link state map:
    throw new Error(`here is where u r at with all this...`)
    /*
    - in three MVC steps:
      - 1. collect broadcast 'link-state' type map from each vbus: where are channels active?
      - 2. for each of those, collect the channel info: it's just route fwding info
      - 3. add functionality to request that we add those... 
      - each is a req & a res, etc, 
    - then carry on w/ the diffing & requesting in the osap.hl.buildBroadcastRoute
    */
  }

  // ------------------------------------------------------ Per-Indice Route Collection 
  this.getEndpointRoute = async (route, indice) => {
    // wait for clear space, 
    await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
    // payload is pretty simple, 
    let id = getNewQueryID()
    let payload = new Uint8Array([PK.DEST, EP.ROUTE_QUERY_REQ, id, indice])
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
          // if mode == 0, no route exists at this indice, resolve undefined 
          // otherwise... resolve the route... 
          if (routeMode == 0) {
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
  }

  // ------------------------------------------------------ Endpoint Route-Addition Request 
  this.setEndpointRoute = async (routeToEndpoint, routeFromEndpoint) => {
    // not all routes have modes, set a default, 
    if (!routeFromEndpoint.mode) { routeFromEndpoint.mode = EP.ROUTEMODE_ACKED }
    // ok we dooooo
    await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
    // similar...
    let id = getNewQueryID()
    // + DEST, + ROUTE_SET, + ID, + Route (route.length + mode + ttl + segsize)
    let payload = new Uint8Array(3 + routeFromEndpoint.path.length + 5)
    payload.set([PK.DEST, EP.ROUTE_SET_REQ, id, routeFromEndpoint.mode])
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
          //console.warn(`ROUTE SET REPLY`)
          if (data[0]) {
            resolve()
          } else {
            reject(`badness error code ${data} from endpoint, on try-to-set-new-route`)
          }
        }
      })
    })
  }

  // ------------------------------------------------------ Endpoint Route-Delete Request 
  this.removeEndpointRoute = async (routeToEndpoint, indice) => {
    await osap.awaitStackAvailableSpace(VT.STACK_ORIGIN)
    // same energy
    let id = getNewQueryID()
    // + DEST, + ROUTE_RM, + ID, + Indice 
    let payload = new Uint8Array([PK.DEST, EP.ROUTE_RM_REQ, id, indice])
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

  // ------------------------------------------------------ Destination Handler: Dispatching Replies 
  this.destHandler = (item, ptr) => {
    // here data[ptr] == PK.PTR, then ptr + 1 is PK.DEST, ptr + 2 is key for us, 
    // ... we could do: 
    // mvc things w/ one attach-and-release reponse handlers and root-unique request IDs, non?
    keySwitch: switch (item.data[ptr + 2]) {
      case EP.ROUTE_QUERY_RES:
      case EP.ROUTE_SET_RES:
      case EP.ROUTE_RM_RES:
      case RT.ERR_RES:
      case RT.DBG_RES:
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
        console.error(`unrecognized key in osap root / mvc dest handler, ${item.data[ptr]}`)
    } // end switch, 
    // all mvc replies get *handled* 
    item.handled()
  }
}