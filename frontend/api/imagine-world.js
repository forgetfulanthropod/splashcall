/**
 * Vercel serverless route for prompt-built Open Worlds.
 * Served at /api/imagine-world. Same body cap and rate limit as Card Creator.
 * With no XAI_API_KEY the route returns a built-in practice world.
 */

const { createApiHandler } = require('../server/vercel-api')

module.exports = createApiHandler('world')
