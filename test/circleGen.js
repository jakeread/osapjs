/*
circleGen.js

makes circular toolpaths, for testy testy 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2022

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

// aye it's space filling curves basically innit, 
export default function circleGen(origin, radius, segmentLength){
  let path = [] 
  let x = 0 
  let y = 0 
  let z = 0
  // how long (in rads) will each segment be?
  let radLength = segmentLength / radius 
  console.log(`arcLen ${segmentLength} in rads is ${radLength}`)
  let rads = 0 
  while(rads < 2 * Math.PI){
    path.push([origin[0] + Math.cos(rads) * radius, origin[1] + Math.sin(rads) * radius, origin[2]])
    rads += radLength
  }
  return path
}

// should add to this thing, do `gennies.js`
let getCircleCoordinates = (theta, scalar) => {
  let tc = [Math.sin(theta) * scalar, Math.cos(theta) * scalar, 0, 0]
  console.log(tc)
  return tc
}