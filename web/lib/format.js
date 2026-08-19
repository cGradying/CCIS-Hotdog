export function discordMessageLink(ref) {
  if (!ref || !ref.guildId || !ref.channelId || !ref.messageId) return null;
  return `https://discord.com/channels/${ref.guildId}/${ref.channelId}/${ref.messageId}`;
}

export function enrichResource(resource) {
  return {
    ...resource,
    fileLink: discordMessageLink(resource.postedRef) || discordMessageLink(resource.reviewRef),
  };
}

export function groupBySubject(resources) {
  const map = new Map();
  for (const resource of resources) {
    if (!map.has(resource.subjectKey)) {
      map.set(resource.subjectKey, {
        key: resource.subjectKey,
        display: resource.subject,
        count: 0,
      });
    }
    map.get(resource.subjectKey).count++;
  }
  return [...map.values()].sort((a, b) => a.display.localeCompare(b.display));
}