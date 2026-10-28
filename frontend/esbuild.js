#!/usr/bin/env node

const esbuild = require('esbuild')
const { exec } = require("child_process")
const fs = require('fs')
const path = require('path')
const envFile = require("dotenv").config()

const buildDir = "build"
const all_keys = [
    "NODE_ENV",
    "REACT_APP_OVERRIDE_NODE_ENV",
    "REACT_APP_IS_LOCAL",
    "REACT_APP_BACKEND_URL",
    "REACT_APP_FIRE_API_KEY",
    "REACT_APP_FIRE_AUTH_DOMAIN",
    "REACT_APP_FIRE_PROJECT_ID",
    "REACT_APP_FIRE_STORAGE_BUCKET",
    "REACT_APP_FIRE_MESSAGING_SENDER_ID",
    "REACT_APP_FIRE_APP_ID",
    "REACT_APP_FIRE_MEASUREMENT_ID",
]

const args = process.argv.slice(2)
const shouldWatch = args.length === 1 && args[0] === 'watch'

const isProduction = envFile.parsed.ESBUILD_NODE_ENV === "production"
envFile.parsed.NODE_ENV = isProduction ? "production" : "development"
const shouldDoIos = envFile.parsed.ESBUILD_DO_IOS === "yes"
const iosTarget = envFile.parsed.ESBUILD_IOS_TARGET
const shouldOpenChrome = envFile.parsed.ESBUILD_OPEN_CHROME === "yes"
const envObj = {}
all_keys.forEach(k => envObj["process.env." + k] = null)
Object.entries(envFile.parsed).forEach(([k, v]) => envObj["process.env." + k] = '"' + v + '"')
console.log(envObj)
main()

async function main() {
    fs.rmSync(buildDir, { "recursive": true, force: true })
    fs.mkdirSync(buildDir)
    copyFolderRecursiveSync('public', buildDir, makeSubdir = false)
    fs.renameSync(buildDir + '/esbuild-index.html', buildDir + '/index.html')
    esbuild.build({
        minify: isProduction,
        sourcemap: !isProduction,
        entryPoints: ['src/index.tsx'],
        bundle: true,
        outfile: buildDir + '/out.js',
        target: 'es6',
        loader: {
            '.ts': 'ts',
            '.tsx': 'tsx',
            '.svg': 'dataurl',
            '.css': 'css',
            '.png': 'file',
            '.jpg': 'file',
        },
        define: envObj,
        watch: !shouldWatch ? null : {
            onRebuild(error, result) {
                if (error) { console.error(`watch at ${new Date()} failed:`, error) }
                else {
                    console.log(`watch build at ${new Date()} succeeded:`, result)
                    maybeDoIos()
                }
            }
        }
    })
        .then(() => {
            console.log("built at " + new Date())
            maybeDoIos()
            // if (shouldOpenChrome){exec("")}
        })
        .catch((err) => { console.error(err) })
}

function maybeDoIos() {
    if (shouldDoIos) {
        exec("npx cap copy ios", forwardAll)
        if (iosTarget != null) {
            exec(`npx cap run ios --no-sync --target=${iosTarget}`, forwardAll)
        }
    }
}

function forwardAll(err, stdout, stderr) {
    err && console.error(err)
    stdout && console.log(stdout)
    stderr && console.error(stderr)
}

function copyFileSync(source, target) {
    let targetFile = target

    // If target is a directory, a new file with the same name will be created
    if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isDirectory()) {
            targetFile = path.join(target, path.basename(source))
        }
    }

    fs.writeFileSync(targetFile, fs.readFileSync(source))
}

function copyFolderRecursiveSync(source, target, makeSubdir = true) {
    let files = []

    // Check if folder needs to be created or integrated
    const targetFolder = makeSubdir ? path.join(target, path.basename(source)) : target
    // const targetFolder = path.join(target, path.basename(source))
    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder)
    }

    // Copy
    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source)
        files.forEach(function (file) {
            const curSource = path.join(source, file)
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(curSource, targetFolder)
            } else {
                copyFileSync(curSource, targetFolder)
            }
        })
    }
}
