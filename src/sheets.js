// Reads email addresses from a public Google Sheet. Accepts either the normal
// share link (…/spreadsheets/d/<id>/edit…) or a ready-made CSV export URL.
// The sheet must be shared as "anyone with the link can view".
export function sheetToCsvExportUrl(url) {
  const match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
  if (String(url || '').includes('/export')) return url;
  return url;
}

// Minimal CSV parser handling quoted fields and escaped quotes — enough for a
// Google Sheets export, no dependency.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^mailto:/i, '');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Returns a de-duplicated list of valid emails found under the named column.
export async function fetchEmailsFromSheet(url, emailColumn = 'Email') {
  const exportUrl = sheetToCsvExportUrl(url);
  const res = await fetch(exportUrl);
  if (!res.ok) throw new Error(`Google Sheets fetch failed (${res.status})`);

  const rows = parseCsv(await res.text());
  if (!rows.length) return [];

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const column = header.indexOf(emailColumn.trim().toLowerCase());
  if (column === -1) {
    throw new Error(`Column "${emailColumn}" not found in the sheet header: ${rows[0].join(', ')}`);
  }

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