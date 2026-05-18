// Anthropic SDK client initialization
//
// v3 changes from v2.0:
//   - Standard ANTHROPIC_API_KEY env var (was AI_INTEGRATIONS_ANTHROPIC_API_KEY for Replit)
//   - No baseURL (direct to api.anthropic.com, was routed through Replit proxy in v2.0)
//
// Ported from src/anthropic-client.ts on 2026-05-17.

const Anthropic = require("@anthropic-ai/sdk").default;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[anthropic-client] ANTHROPIC_API_KEY not set in environment. Claude calls will fail.");
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = client;
