import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.SNEEBLY_ANTHROPIC_API_KEY;
const baseURL = "https://api.anthropic.com";

const client = new Anthropic({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});

export default client;
