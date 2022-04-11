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
import { VT, TIMES } from '../../core/ts.js'

import { html, render } from 'https://unpkg.com/lit-html?module';
import GraphicalContext from '../lit/graphicalElements.js';

let vvtMatch = (a, b) => {
  let ra = a.route
  let rb = b.route
  if (ra.length != rb.length) return false
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] != rb[i]) return false
  }
  return true
}

export default function NetDoodler(xPlace, yPlace) {
  // basically the D3 example, 
  let plane = $('<div>').attr('id', 'my_dataviz').get(0)//.css('background-color', 'ghostwhite').get(0)
  DT.placeField(plane, 1000, 1000, xPlace, yPlace)

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

  // previous graph, previous graphical vertices, 
  let oldGraph = {}
  let oldGvts = []

  // first we want to diff the graph, and get a copy of it in node:links form, for D3 
  // we get a new graph every redraw call, but have an existing copy... 
  this.redraw = async (graph) => {
    window.setState('drawing')
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
      // make a simulation node, 
      let node = { id: lastId++, name: vvt.name, index: nodes.length, vvt: vvt, gvt: gvt }
      nodes.push(node)
      // everything is everything 
      gvt.node = node;
      vvt.gvt = gvt; vvt.node = node;
      // we have a new node, a new gvt, 
      // if there's an element in the old gvts for this node, set fixed posn 
      for (let gvt of oldGvts) {
        if (vvtMatch(vvt, gvt.vvt)) {
          console.log('found same!')
          node.fx = gvt.state.x
          node.fy = gvt.state.y
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
    contextRecursor(graph)
    // delete all old gvts, and reset list, 
    for (let gvt of oldGvts) {
      gvt.delete()
    }
    oldGvts = newGvts
    // do we need to use d3 ?
    let useSim = false 
    for(let gvt of oldGvts){
      if(gvt.node.fx == undefined){
        useSim = true; break;
      }
    } // end check for newshit 
    try {
      await this.settleNodes({nodes: nodes, links: links}, useSim)
    } catch(err) {
      console.error(err)
    }
    // and finally, 
    window.setState('idle')
    oldGraph = graph
  } // end this.redraw 

  // data here is like: { nodes: [ { id: <num>, name: <string>, index: indx } ], links: [ {source: <obj in nodes list>, target: <obj in nodes list>, index: indx } ] }
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
      const simulation = d3.forceSimulation(data.nodes)                 // Force algorithm is applied to data.nodes
        .force("link", d3.forceLink()                               // This force provides links between nodes
          .id(function (d) { return d.id; })                     // This provide  the id of a node
          .links(data.links)                                    // and this the list of links
        )
        .force("charge", d3.forceManyBody().strength(-800))         // This adds repulsion between nodes. Play with the -400 for the repulsion strength
        //.force("center", d3.forceCenter(width / 2, height / 2))     // This force attracts nodes to the center of the svg area
        .alphaMin(0.1)
        .on("tick", ticked)
        .on("end", completion);

      // fix node 0 to home... 
      data.nodes[0].fx = 100; data.nodes[0].fy = 100;

      // This function is run at each iteration of the force algorithm, updating the nodes position.
      function ticked() {
        try {
          for (let node of data.nodes) {
            node.gvt.state.x = node.x
            node.gvt.state.y = node.y
            node.gvt.render()
          }

          link
            .attr("x1", function (d) { return d.source.x; })
            .attr("y1", function (d) { return d.source.y; })
            .attr("x2", function (d) { return d.target.x; })
            .attr("y2", function (d) { return d.target.y; });

          node
            .attr("cx", function (d) { return d.x + 6; })
            .attr("cy", function (d) { return d.y - 6; });

          // stop after one tick / update cycle if we don't need to sim... 
          if(!settle){ simulation.stop(); resolve() }
        } catch (err) { simulation.stop(); reject(err) }
      }

      function completion() { resolve() }
    })
  }
}