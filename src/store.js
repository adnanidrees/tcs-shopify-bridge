// src/store.js
import fs from 'fs';
import path from 'path';

const DB = path.join(process.cwd(), 'shipments.json');

function readAll() {
  try {
    const raw = fs.readFileSync(DB, 'utf8');
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}
function writeAll(rows) {
  try { fs.writeFileSync(DB, JSON.stringify(rows, null, 2)); } catch {}
}

export async function all() { return readAll(); }
export async function pending() { return readAll().filter(r => r.status !== 'FULFILLED'); }
export async function upsert(rec) {
  const rows = readAll();
  const idx = rows.findIndex(r => r.clientReferenceNo === rec.clientReferenceNo);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...rec };
  else rows.push(rec);
  writeAll(rows);
}
