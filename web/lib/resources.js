import {
  getAllApproved as storeGetAllApproved,
  getApprovedBySubject as storeGetApprovedBySubject,
} from '../../src/store.js';
import { enrichResource } from './format.js';

function bySubjectThenTitle(a, b) {
  if (a.subjectKey < b.subjectKey) return -1;
  if (a.subjectKey > b.subjectKey) return 1;
  return a.title.localeCompare(b.title);
}

export async function getAllApproved() {
  const rows = await storeGetAllApproved();
  return rows.map(enrichResource).sort(bySubjectThenTitle);
}

export async function getApprovedBySubject(subject) {
  const rows = await storeGetApprovedBySubject(subject);
  return rows.map(enrichResource).sort((a, b) => a.title.localeCompare(b.title));
}