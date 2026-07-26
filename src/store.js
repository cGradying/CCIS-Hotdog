import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'resources.json');

function readJsonFile(fallback) {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Same pattern as the schedule bot: pick a backend based on which env vars
// are set. Priority: GitHub (a repo used as a JSON file store) → MongoDB
// Atlas → local JSON file. Only one is ever active at a time.
let dbPromise = null;
function getDb() {
  if (!config.mongoUri) return null;
  if (!dbPromise) {
    const client = new MongoClient(config.mongoUri);
    dbPromise = client.connect().then((c) => c.db('resource_faq_bot'));
  }
  return dbPromise;
}

const GITHUB_API = 'https://api.github.com';
const githubEnabled = () => Boolean(config.githubToken && config.githubRepo);

async function githubRequest(method, path, body) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${text}`);
  }
  return res;
}

async function githubRead() {
  const res = await githubRequest(
    'GET',
    `/repos/${config.githubRepo}/contents/${config.githubPath}?ref=${config.githubBranch}`
  );
  if (res.status === 404) return { data: null, sha: null };
  const json = await res.json();
  const decoded = Buffer.from(json.content, 'base64').toString('utf-8');
  return { data: JSON.parse(decoded), sha: json.sha };
}

async function githubWrite(data) {
  const { sha } = await githubRead(); // fetch current sha right before writing
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  await githubRequest('PUT', `/repos/${config.githubRepo}/contents/${config.githubPath}`, {
    message: `Update resources.json — ${new Date().toISOString()}`,
    content,
    branch: config.githubBranch,
    ...(sha ? { sha } : {}),
  });
}

const EMPTY_STORE = { resources: [], subjectChannels: {} };

// Normalizes whatever shape was previously on disk/remote — including the
// older format where the whole file was just a bare resources array —
// into the current { resources, subjectChannels } shape.
function normalizeStoreShape(raw) {
  if (!raw) return { ...EMPTY_STORE };
  if (Array.isArray(raw)) return { resources: raw, subjectChannels: {} };
  return { resources: raw.resources || [], subjectChannels: raw.subjectChannels || {} };
}

async function readStore() {
  if (githubEnabled()) return normalizeStoreShape((await githubRead()).data);
  const db = await getDb();
  if (db) {
    const doc = await db.collection('docs').findOne({ _id: 'resources' });
    return normalizeStoreShape(doc ? doc.data : null);
  }
  return normalizeStoreShape(readJsonFile(null));
}

async function writeStore(store) {
  if (githubEnabled()) {
    await githubWrite(store);
    return store;
  }
  const db = await getDb();
  if (db) {
    await db.collection('docs').updateOne({ _id: 'resources' }, { $set: { data: store } }, { upsert: true });
  } else {
    writeJsonFile(store);
  }
  return store;
}

function normalizeSubject(subject) {
  // Lookup key: strip ALL whitespace so "COMP 001", "comp001", "COMP  001"
  // all collapse to the same key — spacing shouldn't fragment the index.
  return subject.trim().toUpperCase().replace(/\s+/g, '');
}

function displaySubject(subject) {
  // Canonical display form, independent of how the submitter typed it —
  // always "LETTERS NUMBERS" so results look consistent no matter who
  // added what.
  const compact = normalizeSubject(subject);
  const m = compact.match(/^([A-Z]+)(\d.*)$/);
  return m ? `${m[1]} ${m[2]}` : compact;
}

export async function addResource({ subject, title, link, submittedBy }) {
  const store = await readStore();
  const entry = {
    id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    subject: displaySubject(subject),
    subjectKey: normalizeSubject(subject),
    title: title.trim(),
    link: link.trim(),
    submittedBy,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  store.resources.push(entry);
  await writeStore(store);
  return entry;
}

export async function getResource(id) {
  const store = await readStore();
  return store.resources.find((r) => r.id === id) || null;
}

export async function setResourceStatus(id, status, reviewedBy) {
  const store = await readStore();
  const entry = store.resources.find((r) => r.id === id);
  if (!entry) return null;
  entry.status = status;
  entry.reviewedBy = reviewedBy;
  entry.reviewedAt = new Date().toISOString();
  await writeStore(store);
  return entry;
}

export async function getApprovedBySubject(subject) {
  const store = await readStore();
  const key = normalizeSubject(subject);
  return store.resources.filter((r) => r.status === 'approved' && r.subjectKey === key);
}

export async function getKnownSubjects() {
  const store = await readStore();
  const seen = new Map();
  for (const r of store.resources) {
    if (r.status === 'approved' && !seen.has(r.subjectKey)) seen.set(r.subjectKey, r.subject);
  }
  for (const [key, entry] of Object.entries(store.subjectChannels)) {
    if (!seen.has(key)) seen.set(key, entry.display);
  }
  return [...seen.values()];
}

export async function getPending() {
  const store = await readStore();
  return store.resources.filter((r) => r.status === 'pending');
}

// --- subject -> channel/thread mapping, so approved resources auto-post
// somewhere. Fully admin-adjustable at runtime via slash command — add a
// new thread anytime and just point a subject at it, no code changes. ---
export async function setSubjectChannel(subject, channelId) {
  const store = await readStore();
  const key = normalizeSubject(subject);
  store.subjectChannels[key] = { display: displaySubject(subject), channelId };
  await writeStore(store);
  return store.subjectChannels[key];
}

export async function getSubjectChannel(subject) {
  const store = await readStore();
  const key = normalizeSubject(subject);
  return store.subjectChannels[key] || null;
}

export async function getAllSubjectChannels() {
  const store = await readStore();
  return store.subjectChannels;
}
