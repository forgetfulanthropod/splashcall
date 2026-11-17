/**
 * Vercel serverless route for Card Creator.
 * The frontend project is deployed with rootDirectory=frontend, so this file
 * is served at /api/imagine. It uses the same limits and checks as
 * backend/imagine-server.js. XAI_API_KEY stays in the Vercel environment.
 */

const { createApiHandler } = require('../server/vercel-api')

module.exports = createApiHandler('card')
