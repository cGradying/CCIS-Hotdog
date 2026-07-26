import http from 'http';
import { assertConfig } from './config.js';
import { createBot } from './bot.js';

assertConfig();

// This bot has no real web UI, but Render's free tier only offers the
// "Web Service" type for free (Background Worker is paid-only), and Web
// Services require an open port. This tiny listener exists purely to
// satisfy that — /health is what an uptime monitor (see README) pings
// every few minutes to keep Render from putting the whole process to
// sleep, since sleeping would kill the Discord connection along with it.
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('resource-faq-bot is running');
  })
  .listen(PORT, () => {
    console.log(`[web] health listener up on ${PORT} (keep-alive target for uptime monitor)`);
  });

createBot().catch((err) => {
  console.error('[bot] failed to start:', err);
});
