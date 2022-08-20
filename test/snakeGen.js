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
export default function snakeGen(width, depth, height, trackWidth, trackHeight, segmentLength){
  let path = [] 
  let x = 0 
  let y = 0 
  let z = 0
  let e = 0 
  while(z < height){
    while(y < depth){
      while(x < width){
        path.push([x, y, z, e])
        x += segmentLength
        e += trackWidth * trackHeight * segmentLength // cubic units,
      }
      y += trackWidth
      e += trackWidth * trackHeight * trackWidth
      while(x > 0){
        path.push([x, y, z, e])
        x -= segmentLength
        e += trackWidth * trackHeight * segmentLength // cubic units,
      }
      y += trackWidth
      e += trackWidth * trackHeight * trackWidth
    }
    z += trackHeight
    x = 0 
    y = 0 
  }
  return path
}

// should add to this thing, do `gennies.js`
let getCircleCoordinates = (theta, scalar) => {
  let tc = [Math.sin(theta) * scalar, Math.cos(theta) * scalar, 0, 0]
  console.log(tc)
  return tc
}