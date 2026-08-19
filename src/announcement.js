import { config } from './config.js';

// Single source of truth for what an announcement says, so the email body,
// Facebook caption, Discord embed and poster all derive from the same text.
export function buildAnnouncement() {
  const title = config.announcementTitle;
  const description = config.announcementDescription;
  const meetingLink = config.meetingLink;
  const meetingDatetime = config.meetingDatetime;

  const detailLines = [];
  if (meetingDatetime) detailLines.push(`📅 When: ${meetingDatetime}`);
  if (meetingLink) detailLines.push(`🔗 Meeting link: ${meetingLink}`);

  return {
    title,
    description,
    meetingDatetime,
    meetingLink,
    emailSubject: config.emailSubject || title,
    fromName: config.emailFromName,
    plainBody: [description, ...detailLines].filter(Boolean).join('\n\n'),
    discordDescription: [
      description,
      meetingDatetime ? `📅 **When:** ${meetingDatetime}` : null,
      meetingLink ? `🔗 **Join:** ${meetingLink}` : null,
    ]
      .filter(Boolean)
      .join('\n\n'),
    facebookMessage: [title, description, ...detailLines].filter(Boolean).join('\n\n'),
  };
}