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

export default function NetDoodler(xPlace, yPlace) {
  // basically the D3 example, 
  let plane = $('<div>').attr('id', 'my_dataviz').get(0)//.css('background-color', 'ghostwhite').get(0)
  DT.placeField(plane, 400, 400, xPlace, yPlace)

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

  this.redraw = (graph) => {
    // we want to reformat the graph tree into the data layout below... 
    console.log('redraw', graph)
    // we'll populate these recursively... 
    let nodes = []; let links = []
    let lastId = 1;
    let drawTime = TIMES.getTimeStamp()
    // graph starts at the root... we're not drawing explicitly... let's start w/ the 1st vport, 
    let nodeRecursor = (parent, partner) => {
      if(parent.lastDrawTime && parent.lastDrawTime == drawTime) { console.log("bailing"); return }
      // mark for no-backtracking:
      parent.lastDrawTime = drawTime
      // make a node: recursor should only tap each, once 
      let node = { id: lastId ++, name: parent.name, index: nodes.length, gnode: parent }
      nodes.push(node) 
      // that's linked to wherever we came from, so long as it exists 
      if(partner) links.push({source: partner, target: node})
      // look for vports, 
      for(let c = 0; c < parent.children.length; c ++){
        if(parent.children[c].type == VT.VPORT){
          let vp = parent.children[c] 
          console.log(vp)
          if(vp.reciprocal && vp.reciprocal.type != "unreachable" ) nodeRecursor(vp.reciprocal.parent, node)
        }
      }
    }
    // kick it, 
    nodeRecursor(graph)
    // done,
    console.log('le done', nodes, links)
    // draw,
    this.render({nodes: nodes, links: links})
  }
  // data here is like: { nodes: [ { id: <num>, name: <string>, index: indx } ], links: [ {source: <obj in nodes list>, target: <obj in nodes list>, index: indx } ] }
  this.render = (data) => {
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
      .force("charge", d3.forceManyBody().strength(-400))         // This adds repulsion between nodes. Play with the -400 for the repulsion strength
      .force("center", d3.forceCenter(width / 2, height / 2))     // This force attracts nodes to the center of the svg area
      .on("tick", ticked);

    // This function is run at each iteration of the force algorithm, updating the nodes position.
    function ticked() {
      
      link
        .attr("x1", function (d) { return d.source.x; })
        .attr("y1", function (d) { return d.source.y; })
        .attr("x2", function (d) { return d.target.x; })
        .attr("y2", function (d) { return d.target.y; });

      node
        .attr("cx", function (d) { return d.x + 6; })
        .attr("cy", function (d) { return d.y - 6; });
    }
  }

  d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/data_network.json").then((data) => {
    //console.log(data)
    //this.redraw(data)
  });
}