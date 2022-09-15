// ute ! 

export default function gerberConverter(input, options){
  return new Promise((resolve, reject) => {
    if (!options) options = { encoding: 'utf8' }
    let converter = gerberToSvg(input, options, (err, svg) => {
      if (err) {
        reject(err)
      } else {
        // the SVG has .attr for viewbox, anchors, units, etc, 
        // see https://github.com/tracespace/tracespace/blob/main/packages/gerber-to-svg/API.md#output 
        converter.svg = svg 
        resolve(converter)
      }
    })
  })
}