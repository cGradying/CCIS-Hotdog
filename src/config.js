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

  // --- announcement pipeline ---
  googleSheetUrl: process.env.GOOGLE_SHEET_URL || null, // public sheet (or its CSV export URL)
  sheetEmailColumn: process.env.SHEET_EMAIL_COLUMN || 'Email',
  gmailUser: process.env.GMAIL_USER || null, // sender address
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || null, // app password, not the account password
  announcementChannelId: process.env.ANNOUNCEMENT_CHANNEL_ID || null,
  facebookPageId: process.env.FACEBOOK_PAGE_ID || null,
  facebookPageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null,
  announcementTitle: process.env.ANNOUNCEMENT_TITLE || 'Class Announcement',
  announcementDescription: process.env.ANNOUNCEMENT_DESCRIPTION || '',
  meetingLink: process.env.MEETING_LINK || null,
  meetingDatetime: process.env.MEETING_DATETIME || null,
  emailSubject: process.env.EMAIL_SUBJECT || null,
  emailFromName: process.env.EMAIL_FROM_NAME || 'Resource Vault',
  bannerPath: process.env.BANNER_PATH || 'assets/banner.png',
  posterOutputPath: process.env.POSTER_OUTPUT_PATH || 'assets/poster.png',
  outputDir: process.env.OUTPUT_DIR || 'output',
};

export function assertConfig() {
  const missing = [];
  if (!config.discordToken) missing.push('DISCORD_TOKEN');
  if (!config.reviewChannelId) missing.push('REVIEW_CHANNEL_ID');
  if (missing.length) {
    console.warn(`[config] Missing env vars: ${missing.join(', ')}. Submissions won't be reviewable until these are set.`);
  }
}
