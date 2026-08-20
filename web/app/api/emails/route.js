import { NextResponse } from 'next/server';
import { fetchAllEmails, emailsToCsv } from '../../../lib/emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/emails — the full recipient list from the class sheet.
// ?format=csv  → download as recipients.csv (all tabs, deduped)
// otherwise    → { count, emails }
// Optional ?sheetUrl= overrides the server-configured sheet.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sheetUrl = searchParams.get('sheetUrl') || process.env.GOOGLE_SHEET_URL;
  const emailColumn = searchParams.get('emailColumn') || process.env.SHEET_EMAIL_COLUMN || 'Email';

  try {
    const emails = await fetchAllEmails(sheetUrl, emailColumn);
    if (searchParams.get('format') === 'csv') {
      return new NextResponse(emailsToCsv(emails), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="recipients.csv"',
        },
      });
    }
    return NextResponse.json({ count: emails.length, emails });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}