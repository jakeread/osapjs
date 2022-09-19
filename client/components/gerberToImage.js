// this is a total stub that I'm bottling out here: it was in the clankiteClient.js... 

let svgImageLoader = (source) => {
  return new Promise((resolve, reject) => {
    let image = new Image()
    image.onload = () => {
      resolve(image)
    }
    image.onerror = (err) => {
      reject(`failed to load image with source ${source}`)
    }
    image.src = source
  })
}

let gerberTestCode = async () => {
  try {
    // get the gerber as a utf-8 file, 
    let gerb = await GetFile(`save/testGerber/fab-step/GerberFiles/copper_top.gbr`)
    // console.log("gerb", gerb)
    let width = 200
    let height = 200
    // make it into an svg / this library's interpretation 
    let gerbSVG = await gerberConverter(gerb)
    console.log("converted...", gerbSVG)
    // now... we have gerbRep.layer which is an array of svg elements, 
    // so we should be able to make an svg canvas / thing in the dom and throw these in ? 
    let dom = $('.plane').get(0)
    let cont = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    $(dom).append(gerbSVG)
    // we make a blob of the *raw svg string*
    let blob = new Blob([gerbSVG], { type: 'image/svg+xml;charset=utf-8' })
    console.log('have a blob...', blob)
    // url of the blob, 
    let blobURL = (window.URL || window.webkitURL || window).createObjectURL(blob);
    console.log('have blob url...', blobURL)
    // get an image object, 
    let image = await svgImageLoader(blobURL)
    console.log('awaited image...', image)
    let canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    let context = canvas.getContext('2d');   // draw image in canvas starting left-0 , top - 0     
    context.drawImage(image, 0, 0, width, height);
    console.log('into context', context)
    $(dom).append(canvas)
    // can we get the image data...
    let imageData = context.getImageData(0, 0, width, height)
    console.log(imageData)
    let prePath = await ImgToPath2D(imageData, width, 0, 10, -1, 0.5)
    console.log(prePath)
    let path = []
    for (let point of prePath) {
      // transform(point, true)
      path.push({
        target: point,
        rate: 200
      })
    }
    return path
  } catch (err) {
    console.error(err)
  }
}