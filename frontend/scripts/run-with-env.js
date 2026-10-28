#!/usr/bin/env node
/**
 * Load frontend/.env when it exists, then run a command.
 * Missing .env is fine: cloud builds pass values as environment variables.
 * Does not override variables that are already set.
 */
const { spawn } = require('child_process')
const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// Webpack 4 (react-scripts 4) needs the OpenSSL legacy provider on Node 17+.
const nodeOptions = new Set((process.env.NODE_OPTIONS || '').split(/\s+/).filter(Boolean))
nodeOptions.add('--openssl-legacy-provider')
process.env.NODE_OPTIONS = Array.from(nodeOptions).join(' ')

// GitHub Actions sets CI=true, and Create React App then fails the build on lint warnings.
if (process.env.CI === 'true' || process.env.CI === '1') {
    process.env.CI = 'false'
}
if (!process.env.GENERATE_SOURCEMAP) process.env.GENERATE_SOURCEMAP = 'false'
if (!process.env.DISABLE_ESLINT_PLUGIN) process.env.DISABLE_ESLINT_PLUGIN = 'true'

const args = process.argv.slice(2)
if (args.length === 0) {
    console.error('usage: node scripts/run-with-env.js <command> [args...]')
    process.exit(1)
}

const child = spawn(args[0], args.slice(1), {
    stdio: 'inherit',
    shell: false,
    env: process.env,
})
child.on('exit', (code, signal) => {
    if (signal) {
        console.error(`command ended by signal ${signal}`)
        process.exit(1)
    }
    process.exit(code == null ? 1 : code)
})
