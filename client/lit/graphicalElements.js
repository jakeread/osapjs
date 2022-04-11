import { html, render } from 'https://unpkg.com/lit-html?module';
import DT from '../interface/domTools.js'

// everything here should have a constructor for some virtual element...
// and a delete fn 

// graph element for vertex element... 
export default function GraphicalContext(virtualVertex) {
  // everything has its 
  this.vvt = virtualVertex
  // each element goes in dummy container (we could tag this, right?)
  // this is kinda garbo but lit-html will handle one template per container, so here we are 
  let cont = $(`<div>`).get(0)
  $($('.plane').get(0)).append(cont)
  // we have a global uuid (fn on muleClient.js) 
  this.uuid = window.getNewElementUUID()
  // we are a lit element 
  let template = (self) => html`
  <div class="vcontext" id="${self.uuid}" style="position:absolute; border: none; width: 50px; height: 50px; 
  transform: scale(1); left: ${self.state.x}px; top: ${self.state.y}px; background-color: black;"></div>
  `
  // obj has state, 
  this.state = { x: 0, y: 0 }
  // has render call, 
  this.render = () => {
    render(template(this), cont)
  }
  // can rm thing 
  this.delete = () => {
    $(cont).remove()
  }
}

