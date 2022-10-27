/*
snakGen.js

makes snake toolpaths, probably to test 3d printers

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

// aye it's space filling curves basically innit, 
// **e values are in CUBIC MM !!!** 
export default function snakeGen(args) {
  // args.width, args.depth, args.height, args.trackWidth, args.trackHeight, args.segmentLength
  let path = []
  let x = 0
  let y = 0
  let z = 0
  let e = 0 // E units are in cubic mm ! 
  while (z < args.height) {
    z += args.trackHeight
    while (y < args.depth) {
      while (x < args.width) {
        path.push([x, y, z, e])
        x += args.segmentLength
        e += args.trackWidth * args.trackHeight * args.segmentLength // cubic units,
      }
      y += args.trackWidth
      e += args.trackWidth * args.trackHeight * args.trackWidth
      while (x > 0) {
        path.push([x, y, z, e])
        x -= args.segmentLength
        e += args.trackWidth * args.trackHeight * args.segmentLength // cubic units,
      }
      y += args.trackWidth
      // since we are going *up* by trackwidth, trackwidth == segmentLength 
      e += args.trackWidth * args.trackHeight * args.trackWidth
    }
    x = 0
    y = 0
  }
  // do the rate... 
  // cubic mm per linear mm = 
  let cubicMMperLinearMM = args.trackWidth * args.trackHeight
  let linearRate = args.flowRate / cubicMMperLinearMM
  for (let p in path) {
    path[p] = { target: path[p], rate: linearRate }
  }
  return path
}

// should add to this thing, do `gennies.js`
let getCircleCoordinates = (theta, scalar) => {
  let tc = [Math.sin(theta) * scalar, Math.cos(theta) * scalar, 0, 0]
  console.log(tc)
  return tc
}