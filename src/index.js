import { assertConfig } from './config.js';
import { createBot } from './bot.js';

assertConfig();

createBot().catch((err) => {
  console.error('[bot] failed to start:', err);
});
