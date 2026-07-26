import 'dotenv/config';

export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  reviewChannelId: process.env.REVIEW_CHANNEL_ID,
  modRoleId: process.env.MOD_ROLE_ID || null,
  mongoUri: process.env.MONGODB_URI || null,
  // GitHub-as-database — checked first if all three are set. Use a repo
  // dedicated to data only, NOT the bot's own code repo, so submissions
  // don't trigger redeploys on hosts that auto-deploy on push.
  githubToken: process.env.GITHUB_TOKEN || null,
  githubRepo: process.env.GITHUB_DATA_REPO || null, // "yourname/your-data-repo"
  githubBranch: process.env.GITHUB_DATA_BRANCH || 'main',
  githubPath: process.env.GITHUB_DATA_PATH || 'resources.json',
};

export function assertConfig() {
  const missing = [];
  if (!config.discordToken) missing.push('DISCORD_TOKEN');
  if (!config.reviewChannelId) missing.push('REVIEW_CHANNEL_ID');
  if (missing.length) {
    console.warn(`[config] Missing env vars: ${missing.join(', ')}. Submissions won't be reviewable until these are set.`);
  }
}
