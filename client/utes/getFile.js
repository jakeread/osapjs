// bundled up file getter 
let GetFile = (file) => {
  return new Promise((resolve, reject) => {
    $.ajax({
      type: "GET",
      url: file,
      error: function () { reject(`req for ${file} fails`) },
      success: function (xhr, statusText) {
        resolve(xhr)
      }
    })
  })
}

export { GetFile }