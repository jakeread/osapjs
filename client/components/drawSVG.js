export default function DrawSVG(svgin, dpi) {
    // to manipulate full scale:
    let vcanvas = document.createElement('canvas')

    // ... getsize, draw, fill ?
    let getSize = (svg) => {
        // where 'svg' is some string, we return width, height, units
        let i = svg.indexOf("width")
        if (i == -1) {
            return ({
                width: 1,
                height: 1,
                units: 90
            })
        } else {
            var i1 = svg.indexOf("\"", i + 1)
            var i2 = svg.indexOf("\"", i1 + 1)
            var width = svg.substring(i1 + 1, i2)
            i = svg.indexOf("height")
            i1 = svg.indexOf("\"", i + 1)
            i2 = svg.indexOf("\"", i1 + 1)
            var height = svg.substring(i1 + 1, i2)
            let ih = svg.indexOf("height")
            let units = 0
            if (width.indexOf("px") != -1) {
                width = width.slice(0, -2)
                height = height.slice(0, -2)
                units = 90
            } else if (width.indexOf("mm") != -1) {
                width = width.slice(0, -2)
                height = height.slice(0, -2)
                units = 25.4
            } else if (width.indexOf("cm") != -1) {
                width = width.slice(0, -2)
                height = height.slice(0, -2)
                units = 2.54
            } else if (width.indexOf("in") != -1) {
                width = width.slice(0, -2)
                height = height.slice(0, -2)
                units = 1
            } else {
                units = 90
            }
            return ({
                width: width,
                height: height,
                units: units
            })
        }
    }

    return new Promise((resolve, reject) => {
        let loadImageBase64 = (svg, size) => {
            // btoa converts str. to base 64
            let src = "data:image/svg+xml;base64," + window.btoa(svg)
            let img = new Image()
            img.setAttribute('src', src)
            //img.src = 'data:image/svg+xml;utf8,' + svg
            img.onload = () => {
                let height = size.height * dpi / size.units
                let width = size.width * dpi / size.units
                // new vcanvas always,
                vcanvas = document.createElement('canvas')
                console.log(width, height)
                vcanvas.width = width
                vcanvas.height = height
                let ctx = vcanvas.getContext('2d')
                ctx.drawImage(img, 0, 0, width, height)
                let imgData = ctx.getImageData(0, 0, vcanvas.width, vcanvas.height)
                //let width = vcanvas.width * 24.5 / dpi
                resolve({
                    imgdata: imgData,
                    width: vcanvas.width * 24.5 / dpi // actual size, not pixels  
                })
            }
            img.onerror = (err) => {
                reject(err)
            }
        }
        // run,
        let size = getSize(svgin)
        console.warn('have size', size)
        size.width = parseFloat(size.width).toString()
        size.height = parseFloat(size.height).toString()
        loadImageBase64(svgin, size)
    })
}