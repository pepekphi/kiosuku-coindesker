// IMPORTANT: Make sure to define COINDESK_KEY in environment variables.

require('dotenv').config();
const axios = require('axios');

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

// interval in seconds (change as needed)
const CHECK_INTERVAL_SECONDS = 20;

// your webhook endpoint
const WEBHOOK_URL = 'https://kiosuku-production.up.railway.app/incoming';

// CoinDesk API endpoint & limit
const COINDESK_API_URL = 'https://data-api.coindesk.com/news/v1/article/list?lang=EN&limit=5';

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
  const payload = {
    timestamp: new Date(article.PUBLISHED_ON * 1000).toISOString(),
    xId: 'CoinDesk API',
    conversationId: makeRandomConversationId(),
    tweetID: article.URL,
    text: `${article.TITLE} — ${article.SUBTITLE}: ${article.BODY}`
  };
  await axios.post(WEBHOOK_URL, payload);
  console.log('🚀 Sent webhook for', article.GUID);
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
async function checkForNew() {
  try {
    const articles = await fetchLatest();
    // sort newest first
    articles
      .sort((a, b) => b.PUBLISHED_ON - a.PUBLISHED_ON)
      .forEach(article => {
        if (article.PUBLISHED_ON > lastTimestamp) {
          sendWebhook(article).catch(console.error);
          lastTimestamp = Math.max(lastTimestamp, article.PUBLISHED_ON);
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
  // initialize lastTimestamp so you don’t repost old articles
  const initial = await fetchLatest();
  if (initial.length) {
    lastTimestamp = Math.max(...initial.map(a => a.PUBLISHED_ON));
  }
  console.log(`Watching for new articles every ${CHECK_INTERVAL_SECONDS}s…`);
  setInterval(checkForNew, CHECK_INTERVAL_SECONDS * 1000);
})();
