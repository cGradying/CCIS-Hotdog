import path from 'path';
import { fileURLToPath } from 'url';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  AttachmentBuilder,
} from 'discord.js';
import { config } from './config.js';
import { runAnnouncementPipeline } from './pipeline.js';
import {
  addResource,
  getResource,
  setResourceStatus,
  setReviewRef,
  setPostedRef,
  getApprovedBySubject,
  getAllBySubject,
  getKnownSubjects,
  getPending,
  removeResource,
  setSubjectChannel,
  getSubjectChannel,
  getAllSubjectChannels,
} from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OCEAN_BANNER_PATH = path.join(__dirname, '..', 'assets', 'ocean-banner.png');
const OCEAN_BLUE = 0x2ab7ca;
const CONTENT_LIMIT = 1900; // Discord hard cap is 2000
const EMBED_DESC_LIMIT = 4000; // Discord hard cap is 4096

function messageLink(ref) {
  return ref ? `https://discord.com/channels/${ref.guildId}/${ref.channelId}/${ref.messageId}` : null;
}

// Joins lines up to `limit` chars, appending a "…and N more" note instead of
// exceeding Discord's content/embed-description caps.
export function joinWithLimit(lines, limit, unit) {
  let out = '';
  let shown = 0;
  for (const line of lines) {
    const sep = out ? '\n' : '';
    if (out.length + sep.length + line.length > limit) break;
    out += sep + line;
    shown++;
  }
  const remaining = lines.length - shown;
  if (remaining > 0) {
    const note = `\n…and ${remaining} more ${unit}${remaining === 1 ? '' : 's'}`;
    out = out.slice(0, limit - note.length) + note;
  }
  return out;
}

const commands = [
  new SlashCommandBuilder()
    .setName('resource-add')
    .setDescription('Submit a resource for a subject (goes to mod review first)')
    .addStringOption((o) => o.setName('subject').setDescription('Subject code, e.g. COMP 001').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('title').setDescription('What is this? e.g. "Midterm Reviewer"').setRequired(true))
    .addStringOption((o) => o.setName('link').setDescription('A link (optional if attaching a file instead)').setRequired(false))
    .addAttachmentOption((o) => o.setName('file').setDescription('Attach a file instead of (or with) a link').setRequired(false)),

  new SlashCommandBuilder()
    .setName('resources')
    .setDescription('Show approved resources for a subject')
    .addStringOption((o) =>
      o.setName('subject').setDescription('Subject code').setRequired(true).setAutocomplete(true)
    )
    .addStringOption((o) =>
      o
        .setName('search')
        .setDescription('Narrow down by title, e.g. "wa" matches "Wake" but not "Woke"')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName('resource-remove')
    .setDescription('(Mods) Remove a resource')
    .addStringOption((o) =>
      o.setName('subject').setDescription('Subject code').setRequired(true).setAutocomplete(true)
    )
    .addStringOption((o) =>
      o.setName('title').setDescription('Which resource').setRequired(true).setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName('resource-pending')
    .setDescription('(Mods) List resources awaiting review'),

  new SlashCommandBuilder()
    .setName('subject-channel-set')
    .setDescription("(Mods) Set which channel/thread a subject's approved resources get posted to")
    .addStringOption((o) =>
      o.setName('subject').setDescription('Subject code').setRequired(true).setAutocomplete(true)
    )
    .addChannelOption((o) =>
      o.setName('channel').setDescription('The channel or thread to post into').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('subject-channel-list')
    .setDescription('(Mods) List all subject → channel/thread mappings'),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('(Mods) Run the announcement pipeline: emails + Facebook post + channel announcement')
    .addBooleanOption((o) =>
      o
        .setName('dry-run')
        .setDescription('Fetch emails and build the poster, but send/post nothing')
        .setRequired(false)
    ),
].map((c) => c.toJSON());

function isModerator(interaction) {
  if (!interaction.member) return false;
  if (config.modRoleId) return interaction.member.roles.cache.has(config.modRoleId);
  return interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function reviewEmbed(entry, statusLine) {
  const embed = new EmbedBuilder()
    .setColor(entry.status === 'approved' ? 0x39d98a : entry.status === 'rejected' ? 0xe6615a : 0xf2b84b)
    .setTitle(`📥 New resource: ${entry.subject}`)
    .addFields(
      { name: 'Title', value: entry.title },
      { name: 'Link', value: entry.link || (entry.hasFile ? '_(see attached file)_' : '_none_') },
      { name: 'Submitted by', value: entry.submittedBy }
    );
  if (statusLine) embed.setFooter({ text: statusLine });
  return embed;
}

function reviewButtons(entry, disabled = false) {
  const approve = new ButtonBuilder()
    .setCustomId(`res_review:approve:${entry.id}`)
    .setLabel('✅ Approve')
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);
  const reject = new ButtonBuilder()
    .setCustomId(`res_review:reject:${entry.id}`)
    .setLabel('❌ Reject')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled);
  return [new ActionRowBuilder().addComponents(approve, reject)];
}

// Ocean-biome styled post for a subject's channel/thread once approved.
// If the original submission had a file, it's re-attached here by pulling
// a FRESH copy of it from the review message (fetched right before this
// runs), so we never depend on a possibly-stale cached URL.
function oceanPostPayload(entry, freshFileUrl) {
  const banner = new AttachmentBuilder(OCEAN_BANNER_PATH, { name: 'ocean-banner.png' });
  const files = [banner];
  if (freshFileUrl) files.push(new AttachmentBuilder(freshFileUrl));

  const embed = new EmbedBuilder()
    .setColor(OCEAN_BLUE)
    .setTitle(`🌊 New resource — ${entry.subject}`)
    .setDescription(`**${entry.title}**${entry.link ? `\n${entry.link}` : ''}${entry.hasFile ? '\n📎 file attached below' : ''}`)
    .setImage('attachment://ocean-banner.png')
    .setFooter({ text: `〜 Approved by ${entry.reviewedBy} · added by ${entry.submittedBy}` });
  return { embeds: [embed], files };
}

let ready = false;
export function isReady() {
  return ready;
}

async function reportInteractionError(interaction, err) {
  console.error('[bot] unhandled error handling interaction:', err);
  try {
    if (interaction.isAutocomplete()) {
      if (!interaction.responded) await interaction.respond([]);
      return;
    }
    const payload = { content: 'Something went wrong — please try again.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (nestedErr) {
    console.error('[bot] failed to notify user about the earlier error:', nestedErr);
  }
}

export async function createBot() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', async () => {
    ready = true;
    console.log(`[bot] logged in as ${client.user.tag}`);
    try {
      const rest = new REST().setToken(config.discordToken);
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log('[bot] slash commands registered');
    } catch (err) {
      console.error('[bot] failed to register slash commands:', err);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      await handleInteraction(interaction);
    } catch (err) {
      await reportInteractionError(interaction, err);
    }
  });

  await client.login(config.discordToken);
  return client;
}

async function handleInteraction(interaction) {
    // --- autocomplete ---
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);

      if (
        focused.name === 'subject' &&
        ['resources', 'resource-add', 'subject-channel-set', 'resource-remove'].includes(interaction.commandName)
      ) {
        const subjects = await getKnownSubjects();
        const matches = subjects
          .filter((s) => s.toLowerCase().includes(focused.value.toLowerCase()))
          .slice(0, 25)
          .map((s) => ({ name: s, value: s }));
        await interaction.respond(matches);
        return;
      }

      if (interaction.commandName === 'resources' && focused.name === 'search') {
        const subject = interaction.options.getString('subject');
        if (!subject) {
          await interaction.respond([]);
          return;
        }
        const entries = await getApprovedBySubject(subject);
        const q = focused.value.toLowerCase();
        const matches = entries
          .filter((r) => r.title.toLowerCase().includes(q))
          .slice(0, 25)
          .map((r) => ({ name: r.title, value: r.title }));
        await interaction.respond(matches);
        return;
      }

      if (interaction.commandName === 'resource-remove' && focused.name === 'title') {
        if (!isModerator(interaction)) {
          await interaction.respond([]);
          return;
        }
        const subject = interaction.options.getString('subject');
        if (!subject) {
          await interaction.respond([]);
          return;
        }
        const entries = await getAllBySubject(subject);
        const q = focused.value.toLowerCase();
        const matches = entries
          .filter((r) => r.title.toLowerCase().includes(q))
          .slice(0, 25)
          .map((r) => ({ name: `${r.title} (${r.status})`, value: r.id })); // value = id, so removal is unambiguous
        await interaction.respond(matches);
        return;
      }
      return;
    }

    // --- slash commands ---
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'resource-add') {
        const subject = interaction.options.getString('subject');
        const title = interaction.options.getString('title');
        const link = interaction.options.getString('link');
        const file = interaction.options.getAttachment('file');

        if (!link && !file) {
          await interaction.reply({ content: 'Give me a link, a file, or both.', ephemeral: true });
          return;
        }
        if (link && !/^https?:\/\//i.test(link)) {
          await interaction.reply({ content: 'That link needs to start with http:// or https://', ephemeral: true });
          return;
        }

        const entry = await addResource({ subject, title, link, hasFile: Boolean(file), submittedBy: interaction.user.tag });
        await interaction.reply({ content: `Submitted **${title}** for ${subject} — a mod will review it shortly.`, ephemeral: true });

        try {
          const channel = await interaction.client.channels.fetch(config.reviewChannelId);
          const payload = { embeds: [reviewEmbed(entry)], components: reviewButtons(entry) };
          if (file) payload.files = [new AttachmentBuilder(file.url, { name: file.name })];
          const reviewMsg = await channel.send(payload);
          await setReviewRef(entry.id, reviewMsg.guildId, reviewMsg.channelId, reviewMsg.id);
        } catch (err) {
          console.error('[bot] failed to post to review channel:', err);
        }
        return;
      }

      if (interaction.commandName === 'resources') {
        const subject = interaction.options.getString('subject');
        const search = interaction.options.getString('search');
        let results = await getApprovedBySubject(subject);
        if (search) {
          const q = search.toLowerCase();
          results = results.filter((r) => r.title.toLowerCase().includes(q));
        }
        if (!results.length) {
          const scope = search ? `matching "${search}" for **${subject}**` : `for **${subject}**`;
          await interaction.reply({
            content: `No approved resources ${scope}. Add one with \`/resource-add\`!`,
            ephemeral: true,
          });
          return;
        }
        const lines = results.map((r) => {
          const parts = [`• **${r.title}**`];
          if (r.link) parts.push(r.link);
          if (r.hasFile) {
            const link = messageLink(r.postedRef) || messageLink(r.reviewRef);
            parts.push(link ? `📎 [file](${link})` : '📎 file (location unavailable)');
          }
          return parts.join(' — ');
        });
        const embed = new EmbedBuilder()
          .setColor(OCEAN_BLUE)
          .setTitle(`📘 Resources — ${subject}${search ? ` · "${search}"` : ''}`)
          .setDescription(joinWithLimit(lines, EMBED_DESC_LIMIT, 'resource'));
        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (interaction.commandName === 'resource-pending') {
        if (!isModerator(interaction)) {
          await interaction.reply({ content: "You don't have permission to view the review queue.", ephemeral: true });
          return;
        }
        const pending = await getPending();
        if (!pending.length) {
          await interaction.reply({ content: 'Nothing pending review right now. 🎉', ephemeral: true });
          return;
        }
        const lines = pending.map((r) => `• **${r.subject}** — ${r.title} (submitted by ${r.submittedBy})`);
        await interaction.reply({ content: joinWithLimit(lines, CONTENT_LIMIT, 'submission'), ephemeral: true });
        return;
      }

      if (interaction.commandName === 'resource-remove') {
        if (!isModerator(interaction)) {
          await interaction.reply({ content: "You don't have permission to remove resources.", ephemeral: true });
          return;
        }
        const id = interaction.options.getString('title'); // autocomplete value is the id, see above
        const entry = await getResource(id);
        if (!entry) {
          await interaction.reply({ content: "Couldn't find that resource — it may already be removed.", ephemeral: true });
          return;
        }

        // Best-effort: delete whatever message currently represents this
        // resource (its approved post, or the review message if it was
        // never approved). Never let a delete failure block the removal.
        const refToClean = entry.postedRef || entry.reviewRef;
        if (refToClean) {
          try {
            const ch = await interaction.client.channels.fetch(refToClean.channelId);
            const msg = await ch.messages.fetch(refToClean.messageId);
            await msg.delete();
          } catch (err) {
            console.warn('[bot] could not delete the associated message (may already be gone):', err.message);
          }
        }

        await removeResource(id);
        await interaction.reply({ content: `🗑️ Removed **${entry.title}** (${entry.subject}).`, ephemeral: true });
        return;
      }

      if (interaction.commandName === 'subject-channel-set') {
        if (!isModerator(interaction)) {
          await interaction.reply({ content: "You don't have permission to configure this.", ephemeral: true });
          return;
        }
        const subject = interaction.options.getString('subject');
        const channel = interaction.options.getChannel('channel');
        if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
          await interaction.reply({ content: "That channel can't receive messages — pick a text channel or thread.", ephemeral: true });
          return;
        }
        const saved = await setSubjectChannel(subject, channel.id);
        await interaction.reply({
          content: `✅ **${saved.display}** will now post approved resources to <#${channel.id}>.`,
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === 'subject-channel-list') {
        if (!isModerator(interaction)) {
          await interaction.reply({ content: "You don't have permission to view this.", ephemeral: true });
          return;
        }
        const map = await getAllSubjectChannels();
        const entries = Object.values(map);
        if (!entries.length) {
          await interaction.reply({ content: 'No subject → channel mappings set yet. Use `/subject-channel-set`.', ephemeral: true });
          return;
        }
        const lines = entries.map((e) => `• **${e.display}** → <#${e.channelId}>`);
        await interaction.reply({ content: joinWithLimit(lines, CONTENT_LIMIT, 'mapping'), ephemeral: true });
        return;
      }

      if (interaction.commandName === 'announce') {
        if (!isModerator(interaction)) {
          await interaction.reply({ content: "You don't have permission to run announcements.", ephemeral: true });
          return;
        }
        const dryRun = interaction.options.getBoolean('dry-run') ?? false;
        await interaction.deferReply({ ephemeral: true });

        let results;
        try {
          results = await runAnnouncementPipeline({ dryRun });
        } catch (err) {
          console.error('[bot] announcement pipeline crashed:', err);
          await interaction.followUp({ content: `❌ Announcement pipeline crashed: ${err.message}`, ephemeral: true });
          return;
        }

        if (!dryRun && config.announcementChannelId) {
          try {
            const channel = await interaction.client.channels.fetch(config.announcementChannelId);
            const embed = new EmbedBuilder()
              .setColor(OCEAN_BLUE)
              .setTitle(`📣 ${results.announcement.title}`)
              .setDescription(results.announcement.discordDescription)
              .setFooter({ text: 'Announced via pipeline' });
            const payload = { embeds: [embed] };
            if (results.posterPath) payload.files = [new AttachmentBuilder(results.posterPath, { name: 'poster.png' })];
            await channel.send(payload);
          } catch (err) {
            console.error('[bot] failed to post announcement to channel:', err);
          }
        }

        const lines = [
          `**Announcement pipeline complete**${dryRun ? ' (dry run — nothing sent)' : ''}`,
          `👥 Recipients loaded: ${results.recipients.length}`,
          `🖼️ Poster: ${results.posterPath ? 'generated' : 'skipped'}`,
          `📧 Email: ${
            results.email
              ? `sent (${results.email.messageId || 'ok'})`
              : dryRun
                ? 'not sent (dry run)'
                : results.recipients.length
                  ? 'not sent — check GMAIL_USER/GMAIL_APP_PASSWORD'
                  : 'not sent — no recipients'
          }`,
          `📘 Facebook: ${
            results.facebook
              ? results.facebook.skipped
                ? 'skipped (not configured)'
                : `posted (${results.facebook.postId || results.facebook.id})`
              : dryRun
                ? 'not posted (dry run)'
                : 'not configured'
          }`,
          `🔗 Mailto receipt: ${results.mailtoUri ? 'generated (saved to output/)' : 'none'}`,
        ];
        if (results.errors.length) {
          lines.push(`⚠️ ${results.errors.length} step(s) reported errors — see logs.`);
        }
        await interaction.followUp({ content: lines.join('\n'), ephemeral: true });
        return;
      }
    }

    // --- approve/reject buttons ---
    if (interaction.isButton() && interaction.customId.startsWith('res_review:')) {
      const [, action, id] = interaction.customId.split(':');

      if (!isModerator(interaction)) {
        await interaction.reply({ content: "You don't have permission to review submissions.", ephemeral: true });
        return;
      }

      const entry = await getResource(id);
      if (!entry) {
        await interaction.reply({ content: 'This submission no longer exists.', ephemeral: true });
        return;
      }

      const status = action === 'approve' ? 'approved' : 'rejected';
      const updated = await setResourceStatus(id, status, interaction.user.tag, { expectedStatus: 'pending' });
      if (!updated) {
        await interaction.reply({ content: 'Someone already reviewed this submission.', ephemeral: true });
        return;
      }
      let statusLine = `${status === 'approved' ? '✅ Approved' : '❌ Rejected'} by ${interaction.user.tag}`;

      if (status === 'approved') {
        const mapping = await getSubjectChannel(updated.subject);
        if (mapping) {
          try {
            // If there's a file, fetch a FRESH copy of it from the review
            // message right now, rather than reusing a possibly-stale URL.
            let freshFileUrl = null;
            if (updated.hasFile && updated.reviewRef) {
              const reviewChannel = await interaction.client.channels.fetch(updated.reviewRef.channelId);
              const reviewMsg = await reviewChannel.messages.fetch(updated.reviewRef.messageId);
              freshFileUrl = reviewMsg.attachments.first()?.url || null;
            }
            const targetChannel = await interaction.client.channels.fetch(mapping.channelId);
            const posted = await targetChannel.send(oceanPostPayload(updated, freshFileUrl));
            await setPostedRef(id, posted.guildId, posted.channelId, posted.id);
          } catch (err) {
            console.error('[bot] failed to post approved resource to subject channel:', err);
            statusLine += ' · ⚠️ failed to post to subject channel, check it still exists';
          }
        } else {
          statusLine += ' · ⚠️ no channel mapped for this subject yet (/subject-channel-set)';
        }
      }

      await interaction.update({
        embeds: [reviewEmbed(updated, statusLine)],
        components: reviewButtons(updated, true),
      });
    }
}
