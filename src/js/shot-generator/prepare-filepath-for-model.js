// TODO should this be part of ModelLoader?

const { dialog } = require('electron').remote
const fs = require('fs-extra')
const path = require('path')

const ModelLoader = require('../services/model-loader')

// FIXME 
//
// could determine automatically instead
// but in dev mode, doesn't return the correct value when run from `npm run shot-generator`
// see: https://github.com/electron-userland/electron-webpack/issues/243
//
// const { app } = require('electron').remote
// path.join(app.getAppPath(), 'src', 'data', 'shot-generator', 'dummies', 'gltf')
// path.join(app.getAppPath(), 'src', 'data', 'shot-generator', 'objects')

const pathToShotGeneratorData =
  path.join(__dirname, '..', '..', '..', 'src', 'data', 'shot-generator')

const pathToBuiltInModels = {
  character: path.join(pathToShotGeneratorData, 'dummies', 'gltf'),
  object: path.join(pathToShotGeneratorData, 'objects')
} 

const prepareFilepathForModel = async ({
  id,
  model,
  type,

  storyboarderFilePath,

  updateObject
}) => {
  let resourceType = type + 's'
  let resourcePath = path.join(path.dirname(storyboarderFilePath), 'models', resourceType)

  let filepath
  let needsCopy = false

  // is the model built-in?
  if (!ModelLoader.isCustomModel(model)) {
    // easy, just load it from the models folder
    filepath = path.join(pathToBuiltInModels[type], `${model}.glb`)
    needsCopy = false

  // is the model custom?
  } else {
    // the model _is_ the filepath
    filepath = model

    // does it have an absolute path? (e.g.: from an old save file we need to migrate)
    if (path.isAbsolute(filepath)) {
      // ... then we need to copy it to the models/* folder and change its path
      needsCopy = true

    // is it a relative path, and the file is in the models/* folder already?
  } else if (
    // the folder name of the model file ...
    path.normalize(path.dirname(filepath)) ===
    // ... is the same as the folder name where we expect models ...
    path.normalize(path.join('models', resourceType))
  ) {
      // ... then we can load it as-is
      needsCopy = false
      // but the actual filepath we look for needs to be absolute
      filepath = path.join(path.dirname(storyboarderFilePath), filepath)

    } else {
      throw new Error('Could not find model file')
    }
  }

  // so we know the filepath, but what if it doesn’t exist?
  if (!fs.existsSync(filepath)) {
    // ... ask the artist to locate it
    try {
      filepath = await ModelLoader.ensureModelFileExists(filepath)
      console.log(`filepath is now ${filepath}`)
      needsCopy = true

    } catch (error) {
      // cancellation by user
      dialog.showMessageBox({
        title: 'Failed to load',
        message: `Failed to load model ${model}`
      })
      return
    }
  }

  if (needsCopy) {
    try {
      // copy model file to models/* folder and change model path
      console.log('copying model file into models/')
      
      // make sure the path exists
      fs.ensureDirSync(resourcePath)

      // BUG
      // when models: models/objects/fake.glb doesn't exist
      // relocating fails

      // BUG
      // when relocating to a model that's already in the models/objects/* folder
      // fails

      let src = filepath
      let dst = path.join(resourcePath, path.basename(filepath))

      // prompt before overwrite
      if (fs.existsSync(dst)) {
        let choice = dialog.showMessageBox(null, {
          type: 'question',
          buttons: ['Yes', 'No'],
          message: 'Model file already exists. Overwrite?'
        })
        if (choice !== 0) {
          console.log('cancelled model file copy')
          throw new Error('User said no')
        }
      }

      console.log(`copying model file from ${src} to ${dst}`)
      fs.copySync(src, dst, { overwrite: true, errorOnExist: false })

      // update it in the data
      model = path.join('models', resourceType, path.basename(dst))
      console.log(`setting model prop to ${model}`)
      updateObject(id, { model })
      return

    } catch (err) {
      console.error(err)
      alert(err)
      return
    }
  }

  return filepath
}

module.exports = prepareFilepathForModel