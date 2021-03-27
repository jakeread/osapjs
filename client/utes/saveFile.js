let SaveFile = (obj, format, name) => {
    // serialize the thing
    let url = null
    if(format == 'json'){
        url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], {
            type: "application/json"
        }))
    } else if (format == 'csv') {
        let csvContent = "data:text/csv;charset=utf-8," //+ obj.map(e => e.join(',')).join('\n')
        csvContent += "Time,Extension,Load\n"
        csvContent += "(sec),(mm),(N)\n"
        for(let line of obj){
            csvContent += `${line[0].toFixed(3)},${line[1].toFixed(4)},${line[2].toFixed(4)}\n`
        }
        console.log(csvContent)
        url = encodeURI(csvContent)
    }
    // hack to trigger the download,
    let anchor = $('<a>ok</a>').attr('href', url).attr('download', name + `.${format}`).get(0)
    $(document.body).append(anchor)
    anchor.click()
}

export { SaveFile }