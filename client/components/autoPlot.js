/*
autoPlot.js

data splash

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

'use strict'

import DT from '../interface/domTools.js'
import style from '../interface/style.js'

export default function AutoPlot(xPlace, yPlace, xSize, ySize, title, margin = { top: 40, right: 20, bottom: 30, left: 90 }) {
  let chart = $(`<div>`).get(0)
  $(chart).css('background-color', style.grey)
  let uid = `lineChart_${Math.round(Math.random() * 1000)}_uid`
  $(chart).attr('id', uid)
  DT.placeField(chart, xSize, ySize, xPlace, yPlace)

  // the data 
  var datas = []
  var numToHold = 100
  this.setHoldCount = (count) => {
    numToHold = count
  }

  let yDomain = null
  this.setYDomain = (min, max) => {
    yDomain = [min, max]
  }

  if (!title) margin.top = 20

  var width = xSize - margin.left - margin.right
  var height = ySize - margin.top - margin.bottom
  var x = d3.scaleLinear().range([0, width])
  var y = d3.scaleLinear().range([height, 0])
  var thesvg = null

  // redraw 
  this.redraw = () => {
    var valueline = d3.line()
      .x(function (d) {
        return x(d[0])
      })
      .y(function (d) {
        return y(d[1])
      })
    // scale
    x.domain([d3.min(datas, function (d) {
      return d[0]
    }), d3.max(datas, function (d) {
      return d[0];
    })])
    if (yDomain) {
      y.domain(yDomain)
    } else {
      y.domain([d3.min(datas, function (d) {
        return d[1]
      }), d3.max(datas, function (d) {
        return d[1];
      })])
    }
    if (thesvg) {
      d3.select(`#${uid}`).selectAll("*").remove()
    }
    thesvg = d3.select(`#${uid}`).append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    // write it?
    thesvg.append("path")
      .data([datas])
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", "4px")
      .attr("d", valueline)
    // write the x axis
    thesvg.append("g")
      .attr("transform", "translate(0," + height + ")")
      .call(d3.axisBottom(x))
    // the y axis
    thesvg.append("g")
      .call(d3.axisLeft(y))
    // the title 
    if (title) {
      let info = ""
      if (datas.length > 0) {
        info = (datas[datas.length - 1][1]).toFixed(3)
      }
      thesvg.append("text")
        .attr("x", (width / 2))
        .attr("y", 0 - (margin.top / 2))
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-family", "'Courier New', Courier, monospace")
        .text(`${title} ${info}`);
    }
  }
  // startup
  this.redraw()
  // add new pts 
  this.pushPt = (pt) => {
    datas.push(pt)
    if (datas.length > numToHold) {
      datas.shift()
    }
  }
  // reset
  this.reset = () => {
    datas = []
    this.redraw()
  }
}