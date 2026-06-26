/**
 * message.service.js
 *
 * Generates personalised LinkedIn connection notes using OpenAI.
 * Falls back to a template when OpenAI is not configured.
 *
 * Fixed:
 *  - OpenAI client created ONCE (singleton) not per-lead
 *  - Banned-word filter replaces with space instead of deleting (no broken sentences)
 *  - 299 char limit (LinkedIn max is 300)
 */

let openaiClient = null;

function getOpenAIClient() {
  if (openaiClient) return openaiClient;
  try {
    const { OpenAI } = require('openai');
    if (process.env.OPENAI_API_KEY) {
      openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  } catch {
    // openai package not available
  }
  return openaiClient;
}

const BANNED_WORDS = [
  'guaranteed', 'urgent', 'buy now',
  'as discussed', 'as we spoke', 'i know you',
];

function fallbackMessage(lead) {
  const titlePart = lead.job_title ? ` as ${lead.job_title}` : '';
  return `Hi ${lead.first_name}, I noticed your role${titlePart} at ${lead.company} and thought it would be great to connect!`.slice(0, 299);
}

function safetyFilter(msg, lead) {
  let clean = (msg || fallbackMessage(lead))
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^"|"$/g, ''); // Strip surrounding quotes from AI output

  // Replace banned words with a space (not delete — avoids broken sentences)
  for (const word of BANNED_WORDS) {
    clean = clean.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
  }

  clean = clean.replace(/\s+/g, ' ').trim();

  // Ensure the person's name is in the note
  if (!clean.toLowerCase().includes((lead.first_name || '').toLowerCase())) {
    clean = `Hi ${lead.first_name}, ${clean}`;
  }

  return clean.slice(0, 299);
}

async function generateConnectionMessage(lead) {
  const client = getOpenAIClient();

  if (!client) {
    // No API key — use template
    return fallbackMessage(lead);
  }

  try {
    const facts = {
      first_name: lead.first_name,
      last_name:  lead.last_name,
      company:    lead.company,
      job_title:  lead.job_title,
      location:   lead.location,
      notes:      lead.notes,
    };

    const prompt =
      `Write a brief, warm LinkedIn connection note under 280 characters. ` +
      `Be genuine, no sales language, no false claims. ` +
      `Use only these facts: ${JSON.stringify(facts)}`;

    const response = await client.chat.completions.create({
      model:       'gpt-4o-mini',
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens:  120,
    });

    const rawMessage = response.choices[0].message.content || '';
    return safetyFilter(rawMessage, lead);
  } catch (err) {
    console.error('OpenAI error, using fallback message:', err.message);
    return fallbackMessage(lead);
  }
}

module.exports = { generateConnectionMessage, safetyFilter, fallbackMessage };
