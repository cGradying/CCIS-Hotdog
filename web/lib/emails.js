import { unzipSync } from 'fflate';

// Server-side helper: pull every recipient email from a Google Sheet. The XLSX
// export contains ALL tabs, so this covers every section in the class
// directory. Must stay pure-ESM / Worker-safe (no Node-only imports).

export function sheetToXlsxExportUrl(url) {
  const str = String(url || '');
  const match = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
  return str;
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().replace(/^mailto:/i, '');
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function xmlUnescape(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function extractEmailsFromXlsx(buffer) {
  const files = unzipSync(buffer);
  const sharedStrings = [];
  const sharedXml = new TextDecoder().decode(files['xl/sharedStrings.xml'] || new Uint8Array());
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(sharedXml)) !== null) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlUnescape(x[1]));
    sharedStrings.push(texts.join(''));
  }

  const workbookXml = new TextDecoder().decode(files['xl/workbook.xml'] || new Uint8Array());
  const sheetNames = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*sheetId="(\d+)"/g)].map(
    (x) => ({ name: xmlUnescape(x[1]), sheetId: x[2] })
  );

  const seen = new Set();
  const emails = [];
  for (const sheet of sheetNames) {
    const sheetXml = new TextDecoder().decode(files[`xl/worksheets/sheet${sheet.sheetId}.xml`] || new Uint8Array());
    const cellRe = /<c\b[^>]*>(?:<v>[^<]*<\/v>)?<\/c>/g;
    const cells = [];
    let cm;
    while ((cm = cellRe.exec(sheetXml)) !== null) {
      const chunk = cm[0];
      const ref = chunk.match(/r="([A-Z]+\d+)"/);
      const type = chunk.match(/t="(\w+)"/);
      const v = chunk.match(/<v>([^<]*)<\/v>/);
      if (!ref) continue;
      cells.push({ ref: ref[1], type: type ? type[1] : null, val: v ? v[1] : '' });
    }
    const byRow = {};
    for (const c of cells) {
      const row = +c.ref.match(/(\d+)$/)[1];
      if (!byRow[row]) byRow[row] = {};
      byRow[row][c.ref.replace(/\d+$/, '')] = c;
    }
    const rows = Object.keys(byRow).sort((a, b) => +a - +b);
    for (const r of rows) {
      if (r === '1') continue; // header row
      const cell = byRow[r]['A'];
      if (!cell) continue;
      const raw = cell.type === 's' ? sharedStrings[+cell.val] : cell.val || '';
      const email = normalizeEmail(raw);
      if (email && !seen.has(email) && isValidEmail(email)) {
        seen.add(email);
        emails.push(email);
      }
    }
  }
  return emails;
}

function csvToRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

async function fetchEmailsCsvFallback(sheetUrl, emailColumn) {
  const str = String(sheetUrl || '');
  const match = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return [];
  const gid = new URL(str, 'https://docs.google.com').searchParams.get('gid');
  const url = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheets fetch failed (${res.status})`);
  const rows = csvToRows(await res.text());
  if (!rows.length) return [];
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const column = header.indexOf(String(emailColumn).trim().toLowerCase());
  if (column === -1) return [];
  const seen = new Set();
  const emails = [];
  for (let i = 1; i < rows.length; i++) {
    const raw = normalizeEmail(rows[i][column]);
    if (!raw || seen.has(raw) || !isValidEmail(raw)) continue;
    seen.add(raw);
    emails.push(raw);
  }
  return emails;
}

export async function fetchAllEmails(sheetUrl, emailColumn = 'Email') {
  if (!sheetUrl) return [];
  const res = await fetch(sheetToXlsxExportUrl(sheetUrl));
  if (!res.ok) throw new Error(`Sheets fetch failed (${res.status})`);
  const buffer = await res.arrayBuffer();
  const emails = extractEmailsFromXlsx(new Uint8Array(buffer));
  if (!emails.length && emailColumn.toLowerCase() !== 'email') {
    return fetchEmailsCsvFallback(sheetUrl, emailColumn);
  }
  return emails;
}

export function emailsToCsv(emails) {
  const lines = ['email', ...emails.map((e) => `"${String(e).replace(/"/g, '""')}"`)];
  return lines.join('\r\n');
}