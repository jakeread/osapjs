import { html, svg, render } from 'https://unpkg.com/lit-html?module';
import { VT } from '../../core/ts.js';
import DT from '../interface/domTools.js'

// everything here should have a constructor for some virtual element...
// and a delete fn 

// drawing consts... make-actual, 
let gap = 5, padding = 10;

let getCenter = (gvt) => {
  let st = gvt.state 
  return { x: st.x + st.width/2 + padding, y: st.y + st.height/2 + padding }
}

let getLeftEdge = (gvt) => {
  let st = gvt.state
  return { x: st.x, y: st.y + st.height / 2 + padding }
}

let getRightEdge = (gvt) => {
  let st = gvt.state
  return { x: st.x + st.width + 2 * padding, y: st.y + st.height / 2 + padding }
}

let checkGvtOverlap = (a, b) => {
  a = a.state; b = b.state
  // calc like
  if( a.x < (b.x + b.width + 2 * padding) &&
      (a.x + a.width + 2 * padding) > b.x &&
      a.y < (b.y + b.height + 2 * padding) && 
      (a.y + a.height + 2 * padding) > b.y){
    return true 
  } else {
    return false 
  }
}

// graph element for vertex element... 
function GraphicalContext(virtualVertex) {
  // everything has its 
  this.vvt = virtualVertex
  // and some state,
  this.state = { x: 0, y: 0, width: 150, height: 20 }
  // each element goes in dummy container (we could tag this, right?)
  // this is kinda garbo but lit-html will handle one template per container, so here we are 
  let cont = $(`<div>`).get(0)
  $($('.plane').get(0)).append(cont)
  // we have a global uuid (fn on muleClient.js) 
  this.uuid = window.nd.getNewElementUUID()
  // we are a lit element 
  let template = (self) => html`
  <div class="ddlrElement gvtRoot" id="${self.uuid}"
    style = "width: ${self.state.width}px; height: ${self.state.height}px; padding: ${padding}px;
    transform: scale(1); left: ${self.state.x}px; top: ${self.state.y}px;">
    ${self.vvt.name}
  </div>
  `
  // make some children...
  this.children = []
  for (let vvt of this.vvt.children) {
    let gvt = {}
    if(vvt.type == VT.VPORT){
      gvt = new GraphicalVPort(vvt)
    } else if (vvt.type == VT.ENDPOINT){
      gvt = new GraphicalEndpoint(vvt)
    } else {
      gvt = new GraphicalVertex(vvt)
    }
    vvt.gvt = gvt; gvt.vvt = vvt;
    this.children.push(gvt)
  }
  // has render call, 
  this.render = () => {
    render(template(this), cont)
    for (let c in this.children) {
      this.children[c].state.x = this.state.x + 10
      this.children[c].state.y = this.state.y + this.state.height + gap + padding * 2 + (this.children[c].state.height + gap + padding * 2) * parseInt(c)
      this.children[c].render()
    }
  }
  // can rm thing 
  this.delete = () => {
    $(cont).remove()
    for (let child of this.children) { child.delete() }
  }
  // we get added to global list, 
  window.nd.gvts.push(this)
}

function GraphicalVertex(virtualVertex) {
  console.warn(`init generic gvertex ${virtualVertex.name}`)
  this.vvt = virtualVertex
  let ogBackground = "rgb(205, 205, 205)"
  this.state = { x: 0, y: 0, width: 140, height: 20, text: this.vvt.name, backgroundColor: "rgb(205, 205, 205)" }
  // render into... 
  let cont = $('<div>').get(0)
  $($('.plane').get(0)).append(cont)
  // we also have uuid, 
  this.uuid = window.nd.getNewElementUUID()
  // have a template, 
  let template = (self) => html`
  <div class="ddlrElement gvtVertex" id="${self.uuid}"
    style = "width: ${self.state.width}px; height: ${self.state.height}px; padding: ${padding}px;
    transform: scale(1); left: ${self.state.x}px; top: ${self.state.y}px;
    background-color:${self.state.backgroundColor}">
    ${self.state.text}
  </div>
  `
  // utes,
  this.setBackgroundColor = (color) => {
    if (color) {
      this.state.backgroundColor = color
    } else {
      this.state.backgroundColor = ogBackground
    }
    this.render()
  }
  this.setText = (text) => {
    this.state.text = text 
    this.render() 
  }
  // render call, 
  this.render = () => {
    render(template(this), cont)
  }
  // can rm thing,
  this.delete = () => {
    $(cont).remove()
  }
  // we get added to global list,
  window.nd.gvts.push(this)
}

function GraphicalVPort(virtualVertex) {
  // everything has its 
  this.vvt = virtualVertex
  // and some state,
  let ogBackground = "rgb(205, 205, 205)"
  this.state = { x: 0, y: 0, width: 140, height: 20, backgroundColor: ogBackground }
  // render into... 
  let cont = $('<div>').get(0)
  $($('.plane').get(0)).append(cont)
  // we also have uuid, 
  this.uuid = window.nd.getNewElementUUID()
  // have a template, 
  let template = (self) => html`
  <div class="ddlrElement gvtVPort" id="${self.uuid}"
    style = "width: ${self.state.width}px; height: ${self.state.height}px; padding: ${padding}px;
    transform: scale(1); left: ${self.state.x}px; top: ${self.state.y}px;
    background-color:${self.state.backgroundColor}">
    ${self.vvt.name}
  </div>
  `
  // find our partners... 
  this.pipes = []
  this.linkSetup = () => {
    if (this.vvt.reciprocal && this.vvt.reciprocal.type != "unreachable") {
      // check if partner already has one-of-us hooked up, 
      for (let pipe of this.vvt.reciprocal.gvt.pipes) {
        if (pipe.tail = this) {
          return
        }
      }
      // if no existing hookup, we are the head... 
      let pipe = new GraphicalPipe([this, this.vvt.reciprocal.gvt])
      this.pipes.push(pipe)
      // and put that pipe into the friend-pipes-list as well, so it will rerender on their move... 
      this.vvt.reciprocal.gvt.pipes.push(pipe)
    }
  }
  // utes,
  this.setBackgroundColor = (color) => {
    if (color) {
      this.state.backgroundColor = color
    } else {
      this.state.backgroundColor = ogBackground
    }
    this.render()
  }
  // render call, 
  this.render = () => {
    render(template(this), cont)
    for (let pipe of this.pipes) {
      pipe.render()
    }
  }
  // can rm thing,
  this.delete = () => {
    $(cont).remove()
    for (let pipe of this.pipes) { pipe.delete() }
  }
  // we get added to global list,
  window.nd.gvts.push(this)
}

function GraphicalEndpoint(virtualVertex){
  // everything has its 
  this.vvt = virtualVertex
  // and some state,
  let ogBackground = "rgb(205, 205, 205)"
  this.state = { x: 0, y: 0, width: 140, height: 20, backgroundColor: ogBackground }
  // render into... 
  let cont = $('<div>').get(0)
  $($('.plane').get(0)).append(cont)
  // we also have uuid, 
  this.uuid = window.nd.getNewElementUUID()
  // have a template, 
  let template = (self) => html`
  <div class="ddlrElement gvtEndpoint" id="${self.uuid}"
    style = "width: ${self.state.width}px; height: ${self.state.height}px; padding: ${padding}px;
    transform: scale(1); left: ${self.state.x}px; top: ${self.state.y}px;
    background-color:${self.state.backgroundColor}">
    ${self.vvt.name}
  </div>
  `
  // find our partners... 
  this.pipes = []
  this.linkSetup = () => {
    for(let route of this.vvt.routes){
      let walk = window.osap.netRunner.routeWalk(route, this.vvt)
      try {
        walk.path = walk.path.map(x => x.gvt)
      } catch (err){
        console.error("bad map from vvt to gvts for path drawing")
        console.error(err)
      }
      //console.log('drawing thru...', walk)
      // init new, 
      let pipe = new GraphicalPipe(walk.path)
      // add to us & them... 
      this.pipes.push(pipe)
      walk.path[walk.path.length - 1].pipes.push(pipe)
      // color for errors... 
      if(walk.state == "complete"){        
        pipe.state.color = "rgb(200, 200, 250)"
      } else {
        pipe.state.color = "rgb(250, 200, 200)"
      }
    }
  }
  // utes,
  this.setBackgroundColor = (color) => {
    if (color) {
      this.state.backgroundColor = color
    } else {
      this.state.backgroundColor = ogBackground
    }
    this.render()
  }
  // render call, 
  this.render = () => {
    render(template(this), cont)
    for (let pipe of this.pipes) {
      pipe.render()
    }
  }
  // can rm thing,
  this.delete = () => {
    $(cont).remove()
    for (let pipe of this.pipes) { pipe.delete() }
  }
  // we get added to global list,
  window.nd.gvts.push(this)
}

// having a list of virtual vertices to pass through... each item in path should be a gvt, 
function GraphicalPipe(path) {
  // kinda hackney all-consuming SVG canvas, 
  let cont = $('<div style="position:absolute; z-index:0; overflow:visible;"></div>').get(0)
  $($('.plane').get(0)).append(cont)
  // we track... head gvt and tail gt 
  this.head = path[0]
  this.tail = path[path.length - 1]
  this.midpts = path.slice(1, -1)
  this.state = { color: "rgb(150,200,150)", strokeWidth: 5 } // color, etc 
  let template = (self) => {
    let headMid = getCenter(self.head); let tailMid = getCenter(self.tail)
    let head = {}, tail = {} 
    if(headMid.x > tailMid.x){ // 'head' and 'tail' aren't so important for drawing, but which edge to pickup is 
      head = getRightEdge(self.tail); tail = getLeftEdge(self.head)
    } else {
      head = getRightEdge(self.head); tail = getLeftEdge(self.tail)
    }
    // we'd like to make the shortest path, 
    return svg`
    <svg width="10" height="10"  style="position:absolute; z-index:0; overflow:visible;" xmlns:xlink="http://w3.org/1999/xlink">
      <g>
      <path d="
        M ${head.x} ${head.y} C 
        ${head.x + 100} ${head.y} 
        ${tail.x - 100} ${tail.y}
        ${tail.x} ${tail.y}"
        stroke="${self.state.color}" fill="none" stroke-width="${self.state.strokeWidth}"></path>
      <circle r="5" cx="${head.x}" cy="${head.y}" fill="${self.state.color}"></circle>
      <circle r="5" cx="${tail.x}" cy="${tail.y}" fill="${self.state.color}"></circle>
      </g>
    </svg>
    `
  }
  this.render = () => {
    render(template(this), cont)
  }
  this.delete = () => {
    $(cont).remove()
  }
  // we get added to global list, 
  window.nd.gvts.push(this)
}


export { GraphicalContext, GraphicalVertex, checkGvtOverlap }