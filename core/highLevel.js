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
      // console.warn(`setting up keepAlive for ${vvt.name} at ${freshness}ms interval`)
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
      console.error(`KA: keepAlive on ${vvt.name} ends w/ failure:`, err)
    }
  }

  // ... 
  this.addToKeepAlive = async (name, freshness = 1000) => {
    try {
      // find it, start it... 
      let list = await osap.nr.findMultiple(name)
      console.log(`KA: adding ${list.length}x '${name}' to the keepAlive loop`)
      for(let vvt of list){
        runKA(vvt, freshness)
      }
    } catch (err) {
      console.error(err)
      throw err 
    }
  }

  // ------------------------------------------------------ Bus Broadcast Routes 
  this.buildBroadcastRoute = async (transmitterName, parentName, recipientName, log = false) => {
    try {
      // ---------------------------------------- 1. get a local image of the graph, also configured routes 
      let graph = await osap.nr.sweep()
      if(log) console.log(`BBR: got a graph image...`)
      await osap.mvc.fillRouteData(graph)
      if(log) console.log(`BBR: reclaimed route data for the graph...`)
      // ---------------------------------------- 1: get vvts for the transmitter, and each recipient... 
      let transmitter = await osap.nr.find(transmitterName, graph)
      if(log) console.log(`BBR: found 1x transmitter endpoint '${transmitter.name}', now collecting recipients...`)
      let potentials = await osap.nr.findMultiple(recipientName, graph)
      // we only want those recipients that are within our named firmware, so 
      let recipients = []
      for(let rx of potentials){
        if(rx.parent.name == parentName) recipients.push({endpoint: rx})
      }
      if(log) console.log(`BBR: found ${recipients.length}x recipient endpoints '${recipientName}', each within a ${parentName}...`)
      // ---------------------------------------- 2: poke around amongst each recipient to find bus drops, 
      recipientLoop: for(let rx of recipients){
        for(let sib of rx.endpoint.parent.children){
          if(sib.type == VT.VBUS){
            rx.vbus = sib 
            continue recipientLoop;
          }
        }
      }
      // we now have a list of recipients: [{endpoint: <>, vbus: <>}]
      // ---------------------------------------- 3: for each pair, find channels that already work, and first-free channel
      for(let rx of recipients){
        // find first-free 
        for(let ch in rx.vbus.broadcasts){
          if(rx.vbus.broadcasts[ch] == undefined){
            rx.firstFree = ch
            break
          }
        }
        // find existing, 
        rx.existingChannel = null 
        for(let ch in rx.vbus.broadcasts){
          let channel = rx.vbus.broadcasts[ch]
          if(channel != undefined){
            let walk = osap.nr.routeWalk(channel, rx.vbus)
            if(walk.state == 'incomplete') throw new Error(`previously config'd bus channel looks broken?`)
            if(walk.path[walk.path.length - 1] == rx.endpoint){
              if(log) console.log(`BBR: found an existing drop-route on ch ${ch}`)
              rx.existingChannel = ch 
              break;
            }
          }
        }
      }
      // console.log(`recipients`, recipients)
      // ---------------------------------------- 4: if all recipients are on the same existing channel, that's us, 
      let existingChannel = recipients[0].existingChannel
      if(existingChannel){
        for(let rx of recipients){
          if(rx.existingChannel == existingChannel){
            // great, carry on... 
          } else {
            throw new Error(`BBR: looks like *some* drops have an existing ch, not all, awkward diff...`)
          }
        }  
      }
      // ---------------------------------------- 5: pick a channel to build, and build drop-side, 
      let channelSelect = 0
      if(!existingChannel){
        // select the first available, 
        for(let rx of recipients){
          if(parseInt(rx.firstFree) > channelSelect) channelSelect = parseInt(rx.firstFree)
        }
        // build drop-routes... 
        for(let rx of recipients){
          let routeFromVBus = osap.nr.findRoute(rx.vbus, rx.endpoint)
          if(!routeFromVBus) throw new Error(`failed to find vbus-to-endpoint route...`)
          await osap.mvc.setVBusBroadcastChannel(rx.vbus.route, channelSelect, routeFromVBus)
          if(log) console.log(`BBR: just built one new drop-route on ch ${channelSelect}`)
        }
      } else {
        channelSelect = existingChannel
        if(log) console.log(`BBR: will use existing drop-routes on ch ${channelSelect}`)
      }
      // ---------------------------------------- 6: build an outgoing route to that channel... 
      // the target is going to be...
      let headVBus = recipients[0].vbus.reciprocals[0]
      if(!headVBus) throw new Error(`BBR can't find the head of this vbus... ??`)
      if(log) console.log(`BBR: found the broadcasting head within ${headVBus.parent.name}`)
      // we want a route to this object, 
      let routeFromTransmitter = osap.nr.findRoute(transmitter, headVBus)
      if(!routeFromTransmitter) throw new Error(`BBR failed to walk a route from bus-broadcast transmitter to bus head`)
      // to broadcast at the end of this, we append the broadcast instruction... 
      routeFromTransmitter = PK.route(routeFromTransmitter).bbrd(channelSelect).end()
      // PK.logRoute(routeFromTransmitter)
      // let's check that the transmitter doesn't already have this route attached?
      let prevTxRoute = false 
      for(let rt of transmitter.routes){
        if(PK.routeMatch(rt, routeFromTransmitter)){
          if(log) console.log(`BBR: a route from the transmitter to the head-vbus already exists`)
          prevTxRoute = true 
          break
        }
      }
      // can set that up as well...
      if(!prevTxRoute){
        await osap.mvc.setEndpointRoute(transmitter.route, routeFromTransmitter)
        if(log) console.log(`BBR: we've just built a new route from the transmitter to the bus head`)
      } 
      // now return something that we could use later to delete 'em with?
      // or just go back to stateless / name-finding... 
      return;
    } catch (err) {
      console.error(`failed to build broadcast route from ${transmitterName} to all '${recipientName}'s in each ${parentName}`)
      throw err 
    }
  }
}