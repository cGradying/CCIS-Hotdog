import path from 'node:path';
import { config } from './config.js';
import { buildAnnouncement } from './announcement.js';
import { fetchEmailsFromSheet } from './sheets.js';
import { generatePoster, resolveBackground } from './poster.js';
import { sendAnnouncementEmail, buildHtmlBody, buildMailto, writeReceipt } from './mail.js';
import { postToFacebookPage } from './facebook.js';

// Runs the whole announcement flow in one go:
//   1. compose the announcement content from config
//   2. pull recipient emails from the Google Sheet
//   3. generate the poster over the banner image
//   4. send one BCC email to everyone
//   5. write the receipt (audit JSON + mailto link + recipients CSV)
//   6. post the poster + caption to the Facebook Page
// Steps are independent — a failure in one is recorded and the rest proceed.
export async function runAnnouncementPipeline({
  dryRun = false,
  skipEmail = false,
  skipFacebook = false,
  skipPoster = false,
} = {}) {
  const announcement = buildAnnouncement();
  const outputDir = path.resolve(config.outputDir || 'output');

  const results = {
    dryRun,
    announcement,
    recipients: [],
    posterPath: null,
    email: null,
    facebook: null,
    mailtoUri: null,
    receiptFile: null,
    errors: [],
  };

  const step = async (label, fn) => {
    try {
      return await fn();
    } catch (err) {
      results.errors.push({ step: label, message: err.message });
      console.error(`[pipeline] ${label} failed:`, err.message);
      return null;
    }
  };

  if (config.googleSheetUrl) {
    results.recipients = await step('sheets', () =>
      fetchEmailsFromSheet(config.googleSheetUrl, config.sheetEmailColumn)
    );
  }

  if (!skipPoster) {
    results.posterPath = await step('poster', async () => {
      const background = resolveBackground([
        path.resolve(config.bannerPath || ''),
        path.resolve('assets/banner.png'),
        path.resolve('assets/ocean-banner.png'),
      ]);
      return generatePoster({
        title: announcement.title,
        description: announcement.description,
        meetingLink: announcement.meetingLink,
        backgroundPath: background,
        outputPath: path.resolve(config.posterOutputPath || 'assets/poster.png'),
      });
    });
  }

  results.mailtoUri = buildMailto({
    bcc: results.recipients,
    subject: announcement.emailSubject,
    body: announcement.plainBody,
  });

  if (dryRun) return results;

  if (!skipEmail && config.gmailUser && config.gmailAppPassword) {
    if (results.recipients.length) {
      results.email = await step('email', () =>
        sendAnnouncementEmail({
          to: config.gmailUser,
          bcc: results.recipients,
          subject: announcement.emailSubject,
          html: buildHtmlBody(announcement, results.posterPath ? 'poster' : null),
          text: announcement.plainBody,
          posterPath: results.posterPath,
        })
      );
    } else {
      results.errors.push({ step: 'email', message: 'no recipients loaded, nothing to send' });
    }
  }

  if (!skipFacebook && config.facebookPageId && config.facebookPageAccessToken) {
    results.facebook = await step('facebook', () =>
      postToFacebookPage({
        pageId: config.facebookPageId,
        accessToken: config.facebookPageAccessToken,
        message: announcement.facebookMessage,
        imagePath: results.posterPath,
      })
    );
  }

  if (results.recipients.length) {
    results.receiptFile = writeReceipt({
      recipients: results.recipients,
      subject: announcement.emailSubject,
      emailResult: results.email,
      facebookResult: results.facebook,
      mailtoUri: results.mailtoUri,
      outputDir,
    });
  }

  return results;
}