#!/usr/bin/env node
/**
 * SplashCall imports SVGs as image sources. The stock react-scripts 4 file-loader
 * emits them as files; the project instead inlines them with mini-svg-data-uri.
 * This used to be a hand-edited copy of webpack.config.js inside node_modules.
 * Apply that same edit after install so cloud builds keep the behavior.
 */
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'node_modules', 'react-scripts', 'config', 'webpack.config.js')
if (!fs.existsSync(file)) {
    console.log('react-scripts webpack config not found, skipping svg patch')
    process.exit(0)
}

let src = fs.readFileSync(file, 'utf8')
if (src.includes("require('mini-svg-data-uri')")) {
    console.log('react-scripts svg patch already applied')
    process.exit(0)
}

const importNeedle = 'const appPackageJson = require(paths.appPackageJson);\n'
const importInsert = importNeedle + "const svgToMiniDataURI = require('mini-svg-data-uri');\n"
if (!src.includes(importNeedle)) {
    console.error('Could not find the import site in react-scripts webpack.config.js')
    process.exit(1)
}
src = src.replace(importNeedle, importInsert)

const ruleNeedle = '            // Process application JS with Babel.\n'
const ruleInsert = `            {
              test: /\\.svg$/,
              use: [
                {
                  loader: require.resolve('url-loader'),
                  options: {
                    limit: imageInlineSizeLimit,
                    generator: (content) => svgToMiniDataURI(content.toString()),
                  },
                },
              ],
            },
            // Process application JS with Babel.
`
if (!src.includes(ruleNeedle)) {
    console.error('Could not find the babel rule in react-scripts webpack.config.js')
    process.exit(1)
}
src = src.replace(ruleNeedle, ruleInsert)
fs.writeFileSync(file, src)
console.log('applied react-scripts svg inline patch')
