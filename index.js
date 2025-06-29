// IMPORTANT: Make sure to define COINDESK_KEY in environment variables.

require('dotenv').config();
const axios = require('axios');

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const CHECK_INTERVAL_SECONDS = 300; // Interval in seconds, 1s results in rate limit being hit
const SEND_ON_STARTUP = false; // If true, then it always sends the most recent article on startup. If it is false, then it will not do that, and wait for a new article from now on.
const WEBHOOK_URL = 'https://kiosuku-production.up.railway.app/incoming';
const COINDESK_API_URL = 'https://data-api.coindesk.com/news/v1/article/list?lang=EN&limit=1';

// pull your API key from Railway config
const COINDESK_KEY = process.env.COINDESK_KEY;
if (!COINDESK_KEY) {
  console.error('Environment variable COINDESK_KEY is required.');
  process.exit(1);
}

// ─── STATE ───────────────────────────────────────────────────────────────────
let lastTimestamp = 0;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function makeRandomConversationId() {
  return Math.floor(Math.random() * (999_999_999 - 1_000 + 1)) + 1_000;
}

async function fetchLatest() {
  const res = await axios.get(COINDESK_API_URL, {
    headers: { 'X-API-Key': COINDESK_KEY }
  });
  return res.data.Data || [];
}

async function sendWebhook(article) {
  const urlStr    = (article.URL      || '').toString();
  const title     = article.TITLE     || '';
  const subtitle  = article.SUBTITLE  || '';
  const body      = article.BODY      || '';
  const text = subtitle ? `${title} — ${subtitle}: ${body}` : `${title} — ${body}`;

  // truncate to 1600 characters if necessary
  const truncatedText = text.length > 1600
    ? text.slice(0, 1600) + '…'
    : text;
  
  const payload = {
    timestamp: new Date(article.CREATED_ON * 1000).toISOString(),
    xId: 'web article', // has to match the EXT item in COINS sheet
    conversationId: `${makeRandomConversationId()}`,
    tweetId: urlStr,
    text: truncatedText
  };
  console.log('🔔 Webhook payload:', payload);
  await axios.post(WEBHOOK_URL, payload, { headers: { 'Content-Type': 'application/json' } });
  console.log('🚀 Sent webhook for', article.GUID);
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
async function checkForNew() {
  try {
    const articles = await fetchLatest();
    // sort newest first
    articles
      .sort((a, b) => b.CREATED_ON - a.CREATED_ON)
      .forEach(article => {
        if (article.CREATED_ON > lastTimestamp) {
          sendWebhook(article).catch(console.error);
          lastTimestamp = Math.max(lastTimestamp, article.CREATED_ON);
        }
      });
  } catch (e) {
    if (e.response && e.response.status === 429) {
      console.warn('⚠️  Rate limit hit! Increase CHECK_INTERVAL_SECONDS.');
    } else {
      console.error('Error checking for new articles:', e.message);
    }
  }
}

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Watching for new articles every ${CHECK_INTERVAL_SECONDS}s…`);
  if (SEND_ON_STARTUP) {
    await checkForNew();
  } else {
    const initial = await fetchLatest();
    if (initial.length) {
      lastTimestamp = Math.max(...initial.map(a => a.CREATED_ON));
    }
  }
  setInterval(checkForNew, CHECK_INTERVAL_SECONDS * 1000);
})();
