/*
highLevel.js

osap high level prototypes / notions and configs 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import PK from './packets.js'
import TIME from './time.js'
import { VT } from './ts.js'

export default function HighLevel(osap){
  // ------------------------------------------------------ KeepAlive Codes 
  let runKA = async (vvt, freshness) => {
    try {
      // random stutter to avoid single-step overcrowding in large systems 
      console.warn(`setting up keepAlive for ${vvt.name} at ${freshness}ms interval`)
      await TIME.delay(Math.random() * freshness)
      let lastErrorCount = 0
      let lastDebugCount = 0 
      // looping KA 
      while(true){
        let stat = await osap.mvc.getContextDebug(vvt.route)
        if(stat.errorCount > lastErrorCount){
          lastErrorCount = stat.errorCount
          stat = await osap.mvc.getContextDebug(vvt.route, "error")
          console.error(`ERR from ${vvt.name}: ${stat.msg}`)
        }
        if(stat.debugCount > lastDebugCount){
          lastDebugCount = stat.debugCount 
          stat = await osap.mvc.getContextDebug(vvt.route, "debug")
          console.warn(`LOG from ${vvt.name}: ${stat.msg}`)
        }
        await TIME.delay(freshness)
      }
    } catch (err) {
      console.error(`keepAlive on ${vvt.name} ends w/ failure:`, err)
    }
  }

  // ... 
  this.addToKeepAlive = async (name, freshness = 1000) => {
    try {
      // find it, start it... 
      let vvt = await osap.nr.find(name)
      runKA(vvt, freshness)
    } catch (err) {
      console.error(err)
      throw err 
    }
  }

  // ------------------------------------------------------ Bus Broadcast Routes 
  this.buildBroadcastRoute = async (transmitterName, parentName, recipientName) => {
    try {
      // ---------------------------------------- 1. get a local image of the graph, also configured routes 
      let graph = await osap.nr.sweep()
      console.warn(`BBR: got a graph image...`)
      await osap.mvc.fillRouteData(graph)
      console.warn(`BBR: reclaimed route data for the graph...`)
      // going to test vbus ch removal... 
      return 
      // ---------------------------------------- 1: get vvts for the transmitter, and each recipient... 
      let transmitter = await osap.nr.find(transmitterName, graph)
      console.warn(`BBR: found transmitter endpoint '${transmitter.name}', now collecting recipients...`)
      let potentials = await osap.nr.findMultiple(recipientName, graph)
      // we only want those recipients that are within our named firmware, so 
      let recipients = []
      for(let rx of potentials){
        if(rx.parent.name == parentName) recipients.push(rx)
      }
      console.warn(`BBR: found ${recipients.length}x recipient endpoints '${recipientName}', each within a ${parentName}...`)
      // ---------------------------------------- 2: poke around amongst each recipient to find bus drops, 
      let drops = []
      for(let rx of recipients){
        for(let sib of rx.parent.children){
          if(sib.type == VT.VBUS){
            console.warn(`BBR: would go looking here for channel configs...`)
          }
        }
      }
      return 
      /*
      this is turning out to be a little messier... the trouble is finding where bus channels are already 
      configured / etc, we have to do a diffing step & then the adjust. it's a lot of tracing... 
      */
      // ---------------------------------------- 3: get a route to the bus-head, which is going to do the tx'en
      // ok, we can carry on and look for the bus head that each of our recipients are under... 
      let busHeads = [] 
      for(let tail of tails){
        for(let vt of tail.children){
          if(vt.type == VT.VBUS){
            busHeads.push(vt.reciprocals[0])
          }
        }
      } // end tail of tails 
      // this would be the bus head, 
      let cand = busHeads[0]
      for(let head of busHeads){
        if(head != cand) throw new Error(`it seems as though these bus broadcast recipients are on different busses`)
      }
      let broadcastRoute = osap.nr.findRoute(transmitter, cand)
      if(!broadcastRoute) throw new Error(`couldn't find a route between the transmitter and the bus head`)
      console.warn(`found a route between transmitter and bus head...`)
      PK.logRoute(broadcastRoute)
      // route *to broadcast on is* ... let's pick a new channel, 
      broadcastRoute = PK.route(broadcastRoute).bbrd(5)
    } catch (err) {
      console.error(`failed to build broadcast route from ${transmitterName} to all '${recipientName}'s in each ${parentName}`)
      throw err 
    }
  }
}