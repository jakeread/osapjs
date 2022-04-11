import {html, render} from 'https://unpkg.com/lit-html?module';

export default function VVT(vvt){
  // each element goes in dummy container (we could tag this, right?)
  // this is kinda garbo but lit-html will handle one template per container, so here we are 
  let cont = $(`<div>`).get(0)
  $($('.plane').get(0)).append(cont)
  // we are a lit element 
  let template = (state) => html`
  <div class="vcontext" style="position:absolute; border: none; width: 50px; height: 50px; 
  transform: scale(1); left: ${state.x}px; top: ${state.y}px; background-color: black;">
  `
  // obj has state, 
  this.state = {
    x: 100, y: 100
  }
  // has render call, 
  this.render = () => {
    render(template(this.state), cont)
  }
  // can rm thing 
  this.delete = () => {
    $(cont).remove()
  }
}