/*
gridsquid.js

osap tool drawing set

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import DT from '../interface/domTools.js'
import { PK, TS, VT, EP, TIMES } from '../../core/ts.js'

import { Button } from '../interface/button.js'

// probably rename this 
export default function NetRunner(osap, xPlace, yPlace, poll) {
  // ------------------------------------------------------ PLANE / ZOOM / PAN
  let plane = $('<div>').addClass('plane').get(0)
  let wrapper = $('#wrapper').get(0)
  // odd, but w/o this, scaling the plane & the background together introduces some numerical errs,
  // probably because the DOM is scaling a zero-size plane, or somesuch.
  $(plane).css('background', 'url("/osapjs/client/interface/bg.png")').css('width', '100px').css('height', '100px')
  let cs = 1 // current scale,
  let dft = { s: cs, x: 0, y: 0, ox: 0, oy: 0 } // default transform

  // zoom on wheel
  wrapper.addEventListener('wheel', (evt) => {
    if ($(evt.target).is('input, textarea')) return
    evt.preventDefault()
    evt.stopPropagation()

    let ox = evt.clientX
    let oy = evt.clientY

    let ds
    if (evt.deltaY > 0) {
      ds = 0.025
    } else {
      ds = -0.025
    }

    let ct = DT.readTransform(plane)
    ct.s *= 1 + ds
    ct.x += (ct.x - ox) * ds
    ct.y += (ct.y - oy) * ds

    // max zoom pls thx
    if (ct.s > 1.5) ct.s = 1.5
    if (ct.s < 0.05) ct.s = 0.05
    cs = ct.s
    DT.writeTransform(plane, ct)
    DT.writeBackgroundTransform(wrapper, ct)
  })

  // pan on drag,
  wrapper.addEventListener('mousedown', (evt) => {
    if ($(evt.target).is('input, textarea')) return
    evt.preventDefault()
    evt.stopPropagation()
    DT.dragTool((drag) => {
      drag.preventDefault()
      drag.stopPropagation()
      let ct = DT.readTransform(plane)
      ct.x += drag.movementX
      ct.y += drag.movementY
      DT.writeTransform(plane, ct)
      DT.writeBackgroundTransform(wrapper, ct)
    })
  })

  // init w/ defaults,
  DT.writeTransform(plane, dft)
  DT.writeBackgroundTransform(wrapper, dft)

  $(wrapper).append(plane)

  // ------------------------------------------------------ RENDER / RERENDER
  /*
  some meta for this:
    - should do absolute reckoning for nodes,
    - vports attached to node positions, lines attached to vports,
    - render(node) should redraw nodes & all downstream, then we can i.e. 
        draw a node, then adjust it's height later, and redraw downstream 
    ... or some other brilliant recurse-redraw situation 
  */


  // all nodes render into the plane, for now into the wrapper
  // once ready to render, heights etc should be set,
  let renderNode = (node) => {
    let nel = $(`<div>`).addClass('node').get(0) // node class is position:absolute
    nel.style.width = `${parseInt(node.width)}px`
    nel.style.height = `${parseInt(node.height)}px`
    nel.style.left = `${parseInt(node.pos.x)}px`
    nel.style.top = `${parseInt(node.pos.y)}px`
    // quick hack, 
    if(node.vPorts[0].name == "ucbus drop"){
      $(nel).append($(`<div>${node.routeTo.path[9]} ${node.name}</div>`).addClass('nodenamebus'))
    } else {
      $(nel).append($(`<div>${node.name}</div>`).addClass('nodename'))
    }
    if (node.el) $(node.el).remove()
    node.el = nel
    $(plane).append(node.el)
  }

  let DUPLEX_INCOMING = 0
  let DUPLEX_OUTGOING = 1
  let BUSHEAD_OUTGOING = 2
  let BUSDROP_INCOMING = 3

  let renderVPort = (vPort, type) => {
    let nel = $('<div>').addClass('vPort').get(0)
    nel.style.width = `${parseInt(vPort.parent.width) - 4}px`
    let ph = perPortHeight - heightPadding
    nel.style.height = `${parseInt(ph)}px`
    nel.style.left = `${parseInt(vPort.parent.pos.x)}px`
    let ptop = vPort.parent.pos.y + heightPadding + vPort.indice * perPortHeight + heightPadding * 0.5
    nel.style.top = `${parseInt(ptop)}px`
    $(nel).append($(`<div>${vPort.name}</div>`).addClass('vPortname'))
    // draw outgoing svg, 
    switch (type) {
      case DUPLEX_INCOMING:
        // no lines 
        break;
      case DUPLEX_OUTGOING: {
        // anchor position (absolute, within attached-to), delx, dely
        let line = DT.svgLine(perNodeWidth - 2, ph * 0.5, linkWidth, 0, 2)
        $(nel).append(line) // appended, so that can be rm'd w/ the .remove() call
        break;
      }
      case BUSHEAD_OUTGOING: {
        // draw line, smaller 
        let line = DT.svgLine(perNodeWidth - 2, ph * 0.5, linkWidth * 0.6, 0, 2)
        $(nel).append(line)
        break;
      }
      case BUSDROP_INCOMING:
        // line, left
        let line = DT.svgLine(0, ph * 0.5, -linkWidth * 0.6, 0, 2)
        $(nel).append(line)
        break;
      default:
        throw new Error("bad port type passed to rendervport")
        break;
    }
    if (vPort.el) $(vPort.el).remove()
    vPort.el = nel
    $(plane).append(vPort.el)
  }

  // draw vals,
  let perNodeWidth = 60
  let linkWidth = 30
  let perPortHeight = 120
  let perDropOffset = 20
  let heightPadding = 10

  // for now, this'll look a lot like thar recursor,
  // and we'll just do it once, assuming nice and easy trees ...
  this.draw = (root) => {
    console.log('draw')
    let start = performance.now()
    // rm all of these, redraw from scratch each time
    $('.node').remove()
    $('.vPort').remove()
    $('.svgcont').remove()
    // node-to-draw, vPort-entered-on, (and pos. of top of it's <el>), depth of recursion
    let recursor = (node, entry, entryTop, depth) => {
      node.width = perNodeWidth // time being, we are all this wide
      node.height = heightPadding * 2 + node.vPorts.length * perPortHeight // 10px top / bottom, 50 per port
      node.pos = {}
      node.pos.x = depth * (perNodeWidth + linkWidth) + xPlace // our x-pos is related to our depth,
      // and the 'top' - now, if entry has an .el / etc data - if ports have this data as well, less calc. here
      if (entry) {
        node.pos.y = entryTop - entry.indice * perPortHeight - heightPadding
      } else {
        node.pos.y = yPlace + 160
      }
      // draw ready?
      renderNode(node)
      // traverse,
      for (let vp of node.vPorts) {
        if (!vp) continue
        switch (vp.portTypeKey) {
          case EP.PORTTYPEKEY.DUPLEX:
            if (vp == entry) {  // this is the vport we arrived on,
              renderVPort(vp, DUPLEX_INCOMING)
            } else if (vp.reciprocal[0]) { // there is a node across this bridge 
              renderVPort(vp, DUPLEX_OUTGOING)
              recursor(vp.reciprocal[0].parent, vp.reciprocal[0], node.pos.y + heightPadding + vp.indice * perPortHeight, depth + 1)
            } else {
              renderVPort(vp, DUPLEX_INCOMING)
            }
            break;
          case EP.PORTTYPEKEY.BUSHEAD:
            // it's definitely not the entry port, 
            renderVPort(vp, BUSHEAD_OUTGOING)
            // start rendering the line, then walk *down* it, yeah? 
            // inrementing by the height of each reciprocal-parent, recursing thru here.. 
            let dropOffset = 0
            let ax = node.width + linkWidth * 0.5 // anchor for 'bus' line, relative vport bottom left corner 
            let ay = parseInt(vp.el.style.height) * 0.5 - perDropOffset * 0.5
            for (let d = 0; d < vp.maxAddresses; d++) {
              if (vp.reciprocal[d]) {
                console.warn(`found bus recip ${d}`)
                // this will break when busses have anything on the other end, or bus drops have more than one vport 
                dropOffset += parseInt(vp.el.style.height) * 0.5 + 10
                recursor(vp.reciprocal[d].parent, vp.reciprocal[d], node.pos.y + heightPadding + vp.indice * perPortHeight + dropOffset, depth + 1)
                // now that recursor has drawn downstream node, we can get its height 
                dropOffset += parseInt(vp.el.style.height) * 0.5 + perDropOffset + 10
              } else {
                let line = DT.svgLine(node.width + linkWidth * 0.5 - 5, parseInt(vp.el.style.height) * 0.5 + dropOffset, 10, 0, 2)
                $(vp.el).append(line)
                dropOffset += perDropOffset
              }
            }
            let busLine = DT.svgLine(ax, ay, 0, dropOffset, 2)
            $(vp.el).append(busLine)
            break;
          case EP.PORTTYPEKEY.BUSDROP:
            // bus drop, simple ?
            renderVPort(vp, BUSDROP_INCOMING)
            break;
          default:
            console.warn('vport rep w/ bad type key')
            return;
        }
      } // end for-vports 
    } // end recursor def, 
    // start recursor 
    try {
      recursor(root, null, 0, 0)
    } catch (err) {
      console.error(err)
    }
    console.warn(`draw was ${performance.now() - start}ms`)
  } // end draw 

  // ------------------------------------------------------ SWEEP ROUTINES

  // have a route, last neighbour was node, departure port was p, 
  // arrival addr was d, nextRoute is full path to this node 
  let sweepForVPorts = async (node, p, d, nextRoute) => {
    // get num vPorts at next node, and use route back to discover exit port
    let nodeRes = await osap.read(nextRoute, 'name', 'numVPorts')
    //console.warn('noderes route', nodeRes.route)
    // if this works, a node exists on the other side of this port,
    let nextNode = {
      routeTo: nextRoute,
      name: nodeRes.data.name,
      vPorts: []
    }
    // the port that our queries enter on: 
    let entryPort = await osap.readEntryPort(nextRoute)
    // for each next in line,
    for (let np = 0; np < nodeRes.data.numVPorts; np++) {
      try {
        // 1st, get basics & assemble an object,
        let portRes = await osap.read(nextRoute, 'vport', np, 'name', 'portTypeKey', 'maxSegLength', 'maxAddresses')
        let vPort = {
          parent: nextNode,
          indice: parseInt(np),
          name: portRes.data.name,
          portTypeKey: portRes.data.portTypeKey,
          maxSegLength: portRes.data.maxSegLength,
          maxAddresses: portRes.data.maxAddresses,
          reciprocal: new Array(portRes.data.maxAddresses), // empty array... 
          portStatus: new Array(portRes.data.maxAddresses), // also empty
        }
        vPort.reciprocal.fill(false)
        vPort.portStatus.fill(false)
        nextNode.vPorts.push(vPort)
        // if this was the port we entered on, hook it up, so that we can walk links 
        if (np == entryPort) {
          console.warn('set r')
          node.vPorts[p].reciprocal[d] = nextNode.vPorts[np]  // p (node-port) np (next-node-port)
          nextNode.vPorts[np].reciprocal[0] = node.vPorts[p]  // since we are not traversing up busses, [0]
        }
        // now we want to know status(es) for the port: is it open?
        for (let d = 0; d < nextNode.vPorts[np].maxAddresses; d++) {
          let stat = await osap.read(nextRoute, 'vport', np, 'portStatus', d)
          vPort.portStatus[d] = stat.data.portStatus
        }
        // 
      } catch (err) {
        console.error(err)
        console.error('sweep / draw error at port', p, ',', nextNode.name)
        nextNode.vPorts.push(null)
      }
    } // close query on next ports,
    // continue
    await sweepRecurse(nextNode)
  }

  // node is an element in the object tree, representing an osap node. 
  // it has vports, w/ names, etc. we build this object recursively, 
  /*
  let node = {
    name: "str",
    routeTo: uint8Array,
    vPorts: [
      {
        indice: 0,
        name: "str",
        portTypeKey: key,                 // bus_head, bus_drop, duplex
        maxSegLength: <num>,              // max size of a segment transmitted here 
        portStatus: array[maxAddresses],  // open / closed / opening / closing, 
        maxAddresses: <num>,              // count of drops on other end, 
        parent: <node>,                   // 
        reciprocal: array[<vPort>]        // linked drops, 
      }
    ]
  }
  */
  // at this point, the node object is loaded with node.vPorts, 
  // this generates new routes to dive down / 'across' each vport, hopefully finding another node there 
  let sweepRecurse = async (node) => {
    for (let p in node.vPorts) {
      // traversal is different for each type:
      if (node.vPorts[p].portTypeKey == EP.PORTTYPEKEY.DUPLEX) {
        // don't go back up:
        if (node.vPorts[p].reciprocal[0]) continue
        // don't try closed ports,
        if (node.vPorts[p].portStatus[0] != EP.PORTSTATUS.OPEN) {
          if (!node.isRoot) {
            try {
              console.warn(`req open ${p} at ${node.routeTo.path}`)
              await osap.write(node.routeTo, 'vport', parseInt(p), 'portStatus', 0, true)
            } catch (err) {
              console.error(err)
            }
          } else {
            // closed vport at the root: could do direct ask, at the moment the remote
            // proc. dies when the wss connection dies, so this would be futile 
          }
          continue; // continue past closed ports 
        } // end closed-port term, 
        // ok, we're set to dive, add a fwding term to the path, 
        let nextRoute = {
          path: new Uint8Array(node.routeTo.path.length + 3),
          segsize: 128
        }
        nextRoute.path.set(node.routeTo.path)
        nextRoute.path[node.routeTo.path.length] = PK.PORTF.KEY
        TS.write('uint16', parseInt(p), nextRoute.path, node.routeTo.path.length + 1, true)
        //console.log('next path', nextRoute)
        await sweepForVPorts(node, p, 0, nextRoute)
      } else if (node.vPorts[p].portTypeKey == EP.PORTTYPEKEY.BUSHEAD) {
        // try each potential drop, don't try self (0 addr)
        for (let d = 1; d < node.vPorts[p].maxAddresses; d++) {
          // don't need to check against walking back upstream, that would be a bus-drop returning,
          // will only need to do that on multi-host busses, 
          // not closed ports, and don't bother trying to re-open: 
          // at the moment ucbus does this automatically
          if (node.vPorts[p].portStatus[d] != EP.PORTSTATUS.OPEN) continue;
          console.warn(`continue on drop ${d}`)
          // ok, ready to dive down:
          let nextRoute = {
            path: new Uint8Array(node.routeTo.path.length + 5),
            segsize: 128
          }
          nextRoute.path.set(node.routeTo.path) // write in old path, 
          nextRoute.path[node.routeTo.path.length] = PK.BUSF.KEY  // bus forward move 
          TS.write('uint16', parseInt(p), nextRoute.path, node.routeTo.path.length + 1, true) // from this vp
          TS.write('uint16', parseInt(d), nextRoute.path, node.routeTo.path.length + 3, true) // to this rxaddr
          await sweepForVPorts(node, p, d, nextRoute)
        }
      } else if (node.vPorts[p].portTypeKey == EP.PORTTYPEKEY.BUSDROP) {
        // won't try to scan back *up* the bus, but might, if i.e. we want to scope-in
        // on usb connection to i.e. a motor (for debug) while a system is running... 
        console.warn(`bus drop ${p}`)
        return
      } else {
        throw new Error("bad vport typekey")
      }
    } // end loop over vports
  }

  let sweeper = async () => {
    // start from nil,
    let root = {} // home node,
    root.vPorts = [] // our ports,
    root.name = osap.name
    root.isRoot = true
    root.routeTo = {
      path: new Uint8Array(0),
      segsize: 128
    }
    // make definitions of our local ports: this we do w/o querying, 
    for (let p in osap.vPorts) {
      let pOut = {
        indice: parseInt(p),
        name: osap.vPorts[p].name,
        portTypeKey: osap.vPorts[p].portTypeKey,
        maxSegLength: osap.vPorts[p].maxSegLength,
        maxAddresses: 1,
        reciprocal: [],
        portStatus: [osap.vPorts[p].status()],    // port status(es) - always an array, for busses 
      }
      root.vPorts.push(pOut)
      pOut.parent = root
      // kick closed ports: this is different then the remainder of recurse, because we have 
      // direct access to it, 
      if (pOut.portStatus[0] == EP.PORTSTATUS.CLOSED) {
        osap.vPorts[p].requestOpen()
      }
    }
    // now we can start here, to recurse through
    try {
      await sweepRecurse(root)
    } catch (err) {
      console.error('err during sweep', err)
    }
    // return the structure
    return root
  }

  // hmm ...
  let depthAnalysis = (root) => {
    let depths = [0]
    let recursor = (vPort, depth) => {
      if (depth > 6) return // depth limit
      if (vPort.reciprocal) { // places to go,
        for (let vp of vPort.reciprocal.parent.vPorts) {
          depths.push(depth + 1)
          console.log(vPort.reciprocal.parent.name)
          if (vp == vPort.reciprocal) continue // skip entry // TODO circular graphs would stil f us here
          recursor(vp, depth + 1)
        }
      }
    } // end recursor,
    for (let vp of root.vPorts) {
      recursor(vp, 0)
    }
    return Math.max(...depths)
  }

  // ------------------------------------------------------ Sweep Startup / Loop  

  let setPollingStatus = (val) => {
    if (val) {
      runSweepRoutine()
    } else {
      if (ctrl.timer) {
        clearTimeout(ctrl.timer)
        ctrl.timer = undefined
      }
    }
  }

  // TODO: cleanup, sweep should definitely return as a promise, 
  // can set button state with / try or try-not to draw the results based on that 

  let BTN_RED = 'rgb(242, 201, 201)'
  let BTN_GRN = 'rgb(201, 242, 201)'
  let BTN_YLW = 'rgb(240, 240, 180)'
  let BTN_GREY = 'rgb(242, 242, 242)'

  let runSweepRoutine = async () => {
    if (ctrl.awaiting) return
    ctrl.awaiting = true
    $(pollBtn).css('background-color', BTN_YLW)
    try {
      let res = await sweeper()
      this.draw(res)
      $(pollBtn).css('background-color', BTN_GREY)
    } catch (err) {
      console.error('sweeper err', err)
      $(pollBtn).css('background-color', BTN_RED)
    }
    ctrl.awaiting = false
    if (ctrl.polling) {
      ctrl.timer = setTimeout(runSweepRoutine, ctrl.interval)
    }
  }

  // ------------------------------------------------------ Poll Control 

  let ctrl = {
    polling: poll, // init w/ startup arg 
    awaiting: false,
    interval: 1000,
    timer: undefined
  }

  let titleBtn = new Button(xPlace, yPlace, 94, 14, 'netrunner ->')

  let pollBtn = new Button(xPlace, yPlace + 30, 54, 14, 'poll')
  pollBtn.onClick(() => {
    runSweepRoutine()
    pollBtn.good('ok', 250)
  })

  let loopBtn = new Button(xPlace, yPlace + 60, 54, 14, 'loop')
  loopBtn.onClick(() => {
    if(ctrl.polling) {
      ctrl.polling = false 
    } else {
      ctrl.polling = true 
    }
    setTimeout(setPollingState, 0)
  })

  let setPollingState = () => {
    if (ctrl.polling) {
      $(loopBtn.elem).text('stop')
      $(loopBtn.elem).css('background-color', BTN_GRN)
      runSweepRoutine()
    } else {
      $(loopBtn.elem).text('loop')
      $(loopBtn.elem).css('background-color', BTN_GREY)
    }
  }

  // ------------------------------------------------------ START CONDITION 

  setPollingState()
}
