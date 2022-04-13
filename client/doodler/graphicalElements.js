import { html, render } from 'https://unpkg.com/lit-html?module';
import DT from '../interface/domTools.js'

// everything here should have a constructor for some virtual element...
// and a delete fn 

// drawing consts... make-actual, 
let width = 150, rootHeight = 20, childHeight = 15, gap = 5, padding = 10;

// graph element for vertex element... 
function GraphicalContext(virtualVertex) {
  // everything has its 
  this.vvt = virtualVertex
  // and some state,
  this.state = { x: 0, y: 0 }
  // each element goes in dummy container (we could tag this, right?)
  // this is kinda garbo but lit-html will handle one template per container, so here we are 
  let cont = $(`<div>`).get(0)
  $($('.plane').get(0)).append(cont)
  // we have a global uuid (fn on muleClient.js) 
  this.uuid = window.nd.getNewElementUUID()
  // we are a lit element 
  let template = (self) => html`
  <div class="ddlrElement gvtRoot" id="${self.uuid}"
    style = "width: ${width}px; height: ${rootHeight}px; padding: ${padding}px;
    transform: scale(1); left: ${self.state.x}px; top: ${self.state.y}px;">
    ${self.vvt.name}
  </div>
  `
  // make some children...
  this.children = []
  for(let vvt of this.vvt.children){
    let gvt = new GraphicalChild(vvt)
    vvt.gvt = gvt; gvt.vvt = vvt;
    this.children.push(gvt)
  }
  // has render call, 
  this.render = () => {
    render(template(this), cont)
    for(let c in this.children){
      this.children[c].state.x = this.state.x + 10
      this.children[c].state.y = this.state.y + rootHeight + gap + padding * 2 + (childHeight + gap + padding * 2) * parseInt(c)
      this.children[c].render()
    }
  }
  // can rm thing 
  this.delete = () => {
    $(cont).remove()
    for(let child of this.children){
      child.delete()
    }
  }
}

function GraphicalChild(virtualVertex) {
  // everything has its 
  this.vvt = virtualVertex
  // and some state,
  let ogBackground = "rgb(205, 205, 205)"
  this.state = { x: 0, y: 0, backgroundColor: ogBackground }
  // render into... 
  let cont = $('<div>').get(0)
  $($('.plane').get(0)).append(cont)
  // we also have uuid, 
  this.uuid = window.nd.getNewElementUUID()
  // have a template, 
  let template = (self) => html`
  <div class="ddlrElement gvtChild" id="${self.uuid}"
    style = "width: ${width - 10}px; height: ${childHeight}px; padding: ${padding}px;
    transform: scale(1); left: ${self.state.x}px; top: ${self.state.y}px;
    background-color:${this.state.backgroundColor}">
    ${self.vvt.name}
  </div>
  `
  // utes,
  this.setBackgroundColor = (color) => {
    if(color){
      this.state.backgroundColor = color 
    } else {
      this.state.backgroundColor = ogBackground
    }
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
}


export { GraphicalContext, GraphicalChild }