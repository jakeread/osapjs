/*
netDoodler.js

osap tool drawing set

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import DT from '../interface/domTools.js'
import { Button, TextBlock } from '../interface/basics.js'
import { VT, TIMES } from '../../core/ts.js'
import { GraphicalContext } from './graphicalElements.js';

// get sameness based on route uniqueness 
let vvtMatch = (a, b) => {
  let ra = a.route
  let rb = b.route
  if (ra.length != rb.length) return false
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] != rb[i]) return false
  }
  return true
}

// get dom:gvt match
let getGvtByUUID = (uuid) => {
  for (let cand of window.nd.gvts){
    if(cand.uuid == parseInt(uuid)){
      return cand
    }
  }
  return null
}

// global mouse listener, w/ also one in ../interface/grid.js
window.addEventListener('mousedown', (evt) => {
  // it's us? 
  if (!($(evt.target).is('.gvtRoot'))) {
    console.log(evt.target)
    return;
  }
  // see if we can't get the gvx... 
  let id = $(evt.target).attr('id')
  // can we find it ?
  let gvt = getGvtByUUID(id)
  if (!gvt) { console.warn('no gvt found on drag'); return }
  // gottem 
  console.log('drag gvt', gvt)
  evt.preventDefault(); evt.stopPropagation();
  let ogmx = evt.clientX; let ogmy = evt.clientY;
  let oggx = gvt.state.x; let oggy = gvt.state.y;
  // if state transition OK, set drag... 
  if (window.nd.stateTransition('dragging')) {
    // set drag handler, 
    DT.dragTool((drag) => {
      let delx = drag.clientX - ogmx; let dely = drag.clientY - ogmy;
      gvt.state.x = oggx + delx; gvt.state.y = oggy + dely;
      gvt.render()
    }, (up) => { window.nd.stateTransition('idle') })
  } else {
    return
  }
})

// try hover listeners, we have to re-register these after each render, wherp 
let registerHandlers = () => {
  // hover listener, 
  $('.gvtChild').hover((enter) => {
    console.warn('hov')
    let gvt = getGvtByUUID($(enter.target).attr('id'))
    if (!gvt) { console.error('no gvt on gvtChild hover entrance'); return }
    if(gvt.vvt.reciprocal){
      gvt.setBackgroundColor(`rgb(180, 180, 180)`)
      gvt.vvt.reciprocal.gvt.setBackgroundColor(`rgb(180, 180, 180)`)
    }
  }, (exit) => {
    let gvt = getGvtByUUID($(exit.target).attr('id'))
    if (!gvt) { console.error('no gvt on gvtChild hover exit'); return }
    if(gvt.vvt.reciprocal){
      gvt.setBackgroundColor()
      gvt.vvt.reciprocal.gvt.setBackgroundColor()
    }
  })
}


export default function NetDoodler(osap, xPlace, yPlace, _runState = true) {
  // -------------------------------------------- ND STATE MANAGE 
  // we have some basic controls here, 
  let runState = _runState
  let checkRunState = () => {
    if (runState) {
      runBtn.green(); this.stateTransition("scanning")
    } else {
      runBtn.red();
    }
  }
  let runBtn = new Button(xPlace + 500, yPlace + 10, 84, 84, 'loop?')
  runBtn.onClick((evt) => {
    runState = !runState
    checkRunState()
  })
  // and a display of our current state, 
  let stateDisplay = new TextBlock(xPlace + 500, yPlace + 110, 84, 40, 'idle')
  let writeState = (state) => {
    this.state = state
    stateDisplay.setText(state)
  }
  writeState('idle')
  // tiny ute, 
  this.awaitIdle = () => {
    return new Promise((resolve, reject) => {
      let check = () => { this.state == idle ? resolve() : setTimeout(check, 50) }
      check()
      setTimeout(() => { reject("awaitIdle timeout"), 5000 })
    })
  }
  // state machine transitions... returns true if legal transit 
  let scanTimer = null
  this.stateTransition = (target, arg) => {
    console.log(`${this.state} -> ${target}`)
    try {
      if (this.state == "idle" && target == "scanning") {
        writeState("scanning")
        osap.netRunner.sweep().then((net) => {
          this.stateTransition("drawing", net)
        }).catch((err) => {
          console.error(err)
          this.stateTransition("error")
        })
        return true
      } else if (this.state == "scanning" && target == "drawing") {
        writeState("drawing")
        this.redraw(arg).then(() => {
          this.stateTransition("idle")
        }).catch((err) => {
          console.error(err)
          this.stateTransition("error")
        })
        return true
      } else if ((this.state == "drawing" || this.state == "dragging") && target == "idle") {
        writeState("idle")
        if (runState && !scanTimer) {
          scanTimer = setTimeout(() => { scanTimer = null; this.stateTransition("scanning") }, 1000)
        }
        return true
      } else if (this.state == "drawing" && target == "dragging") {
        simulation.stop();
        writeState("dragging");
        return true;
      } else if ((this.state == "idle" || this.state == "scanning") && target == "dragging") {
        writeState("dragging")
        return true
      } else if (this.state == "dragging" && (target == "scanning" || target == "drawing")) {
        return false
      } else if (target == "error") {
        writeState("error");
      } else {
        console.error(`unknown state transition from ${this.state} to ${target}`)
        this.stateTransition("error")
        return false
      }
    } catch (err) {
      writeState("error")
      console.error(err)
    }
  }
  checkRunState()
  // -------------------------------------------- ND UTES 
  let lastUUID = 0
  this.getNewElementUUID = () => {
    return lastUUID++
  }

  // -------------------------------------------- ND OP ? 
  // basically the D3 example, 
  let plane = $('<div>').attr('id', 'my_dataviz').get(0)//.css('background-color', 'ghostwhite').get(0)
  DT.placeField(plane, 1000, 1000, xPlace, yPlace + 500)

  // set the dimensions and margins of the graph
  const margin = { top: 10, right: 30, bottom: 30, left: 40 },
    width = 400 - margin.left - margin.right,
    height = 400 - margin.top - margin.bottom;

  // append the svg object to the body of the page
  const svg = d3.select("#my_dataviz")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform",
      `translate(${margin.left}, ${margin.top})`);

  // there is a map between simulation posns and drawing posns, since 
  // we can't move spawn origin for d3 sim, ffs, https://observablehq.com/@d3/force-layout-phyllotaxis 
  let simOffset = 500
  this.gvts = [] 
  // first we want to diff the graph, and get a copy of it in node:links form, for D3 
  // we get a new graph every redraw call, but have an existing copy... 
  this.redraw = async (graph) => {
    // we'll populate these recursively... 
    let newGvts = []
    let nodes = []; let links = []
    let lastId = 1;
    let drawTime = TIMES.getTimeStamp()
    // let's just walk the graph and try our new rendering tech, 
    let contextRecursor = (vvt, partner = undefined) => {
      // don't recurse back up, 
      if (vvt.lastDrawTime && vvt.lastDrawTime == drawTime) return;
      vvt.lastDrawTime = drawTime
      // make a node for this thing, and an element for ourselves, 
      let gvt = new GraphicalContext(vvt) // won't exist until we render it 
      newGvts.push(gvt)
      // gvts also have children... that we want in the top level list, 
      for(let child of gvt.children){
        newGvts.push(child)
      }
      // make a simulation node, 
      let node = { id: lastId++, name: vvt.name, index: nodes.length, vvt: vvt, gvt: gvt }
      nodes.push(node)
      // everything is everything 
      gvt.node = node;
      vvt.gvt = gvt; vvt.node = node;
      // we have a new node, a new gvt, 
      // if there's an element in the old gvts for this node, set fixed posn 
      for (let gvt of this.gvts) {
        if (vvtMatch(vvt, gvt.vvt)) {
          console.log('found same!')
          node.fx = gvt.state.x - simOffset
          node.fy = gvt.state.y - simOffset
        }
      }
      // add link if it exists 
      if (partner) links.push({ source: partner, target: node })
      // sweep thru vports 
      for (let c = 0; c < vvt.children.length; c++) {
        if (vvt.children[c].type == VT.VPORT) {
          let vp = vvt.children[c]
          if (vp.reciprocal && vp.reciprocal.type != "unreachable") contextRecursor(vp.reciprocal.parent, node)
        }
      }
    }
    // kick it w/ root as root... 
    try{
      contextRecursor(graph)
    } catch (err) {
      console.error(err)
    }
    // stuff 1st node to 0,0 if it's new
    if (nodes[0] && !nodes[0].fx) {
      nodes[0].fx = - simOffset + 100; nodes[0].fy = - simOffset + 100;
    }
    // delete all old gvts, and reset list, 
    for (let gvt of this.gvts) {
      gvt.delete()
    }
    this.gvts = newGvts
    // do we need to use d3 ?
    let useSim = false
    for (let gvt of this.gvts) {
      if (gvt.node && gvt.node.fx == undefined) {
        useSim = true; break;
      }
    } // end check for newshit 
    try {
      await this.settleNodes({ nodes: nodes, links: links }, useSim)
    } catch (err) {
      console.error(err)
    }
  } // end this.redraw 

  // data here is like: { nodes: [ { id: <num>, name: <string>, index: indx } ], links: [ {source: <obj in nodes list>, target: <obj in nodes list>, index: indx } ] }
  let simulation = null
  this.settleNodes = (data, settle) => {
    return new Promise((resolve, reject) => {
      // Initialize the links
      const link = svg
        .selectAll("line")
        .data(data.links)
        .join("line")
        .style("stroke", "salmon")

      // Initialize the nodes
      const node = svg
        .selectAll("circle")
        .data(data.nodes)
        .join("circle")
        .attr("r", 20)
        .style("fill", "lightsalmon")

      // Let's list the force we wanna apply on the network
      simulation = d3.forceSimulation(data.nodes)                 // Force algorithm is applied to data.nodes
        .force("link", d3.forceLink()                               // This force provides links between nodes
          .id(function (d) { return d.id; })                     // This provide  the id of a node
          .links(data.links)                                    // and this the list of links
          .distance(function (d) { return 100; })
        )
        .force("charge", d3.forceManyBody().strength(-400))         // This adds repulsion between nodes. Play with the -400 for the repulsion strength
        //.force("center", d3.forceCenter(width / 2, height / 2))     // This force attracts nodes to the center of the svg area
        .alphaMin(0.1)
        .on("tick", ticked)
        .on("end", completion);

      // it's a mess, but after each 1st-cycle we want to register global handlers, so need:
      let first = true
      // This function is run at each iteration of the force algorithm, updating the nodes position.
      function ticked() {
        try {
          for (let node of data.nodes) {
            node.gvt.state.x = node.x + simOffset
            node.gvt.state.y = node.y + simOffset
            node.gvt.render()
          }

          if (first) {
            registerHandlers()
            first = false
          }

          link
            .attr("x1", function (d) { return d.source.x + simOffset; })
            .attr("y1", function (d) { return d.source.y + simOffset; })
            .attr("x2", function (d) { return d.target.x + simOffset; })
            .attr("y2", function (d) { return d.target.y + simOffset; });

          node
            .attr("cx", function (d) { return d.x + simOffset; })
            .attr("cy", function (d) { return d.y + simOffset; });

          // stop after one tick / update cycle if we don't need to sim... 
          if (!settle) { simulation.stop(); simulation = null; resolve() }
        } catch (err) { simulation.stop(); simulation = null; reject(err) }
      }

      function completion() { simulation = null; resolve() }
    })
  }
}