// Metro, with the web app's pure modules shared rather than copied.
//
// The app imports a handful of dependency-free files from ../src (the loop
// direction lens, the timeline builder, the glance composer, the brand
// registry, and the API contract types) through the `@atturel/web/*` alias in
// tsconfig.json. Metro needs to be allowed to watch that folder; everything
// else stays inside this project.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const webSrc = path.resolve(projectRoot, '../src')

const config = getDefaultConfig(projectRoot)
config.watchFolders = [...(config.watchFolders ?? []), webSrc]
// Shared files must resolve their own (rare) dependencies from this app.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]

module.exports = config
