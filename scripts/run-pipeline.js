// One-shot CLI for the announcement pipeline, no Discord needed:
//   node scripts/run-pipeline.js                # full run (email + facebook + poster)
//   node scripts/run-pipeline.js --dry-run      # fetch emails + build poster, send nothing
//   node scripts/run-pipeline.js --skip-email --skip-facebook
import { runAnnouncementPipeline } from '../src/pipeline.js';

const args = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));

const results = await runAnnouncementPipeline({
  dryRun: args.has('--dry-run'),
  skipEmail: args.has('--skip-email'),
  skipFacebook: args.has('--skip-facebook'),
  skipPoster: args.has('--skip-poster'),
});

const summary = {
  dryRun: results.dryRun,
  recipients: results.recipients.length,
  poster: results.posterPath || null,
  email: results.email,
  facebook: results.facebook,
  mailto: results.mailtoUri,
  receipt: results.receiptFile || null,
  errors: results.errors,
};
console.log(JSON.stringify(summary, null, 2));

if (results.recipients.length) {
  console.log('\nDiscord announcement (post this, or use /announce in the bot):\n');
  console.log(`**${results.announcement.title}**\n\n${results.announcement.discordDescription}`);
}

process.exit(results.errors.length ? 1 : 0);