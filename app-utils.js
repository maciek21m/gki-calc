const STORAGE_KEY = 'gki_records_v1';

export function saveRecord(record) {
  const list = loadRecords();
  list.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export function overwriteRecords(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function exportCSV(records) {
  const sep = ';';
  const rows = [['date', 'time', 'timezone', 'glucose', 'glucose_unit', 'ketones', 'gki', 'note']];
  const pad = n => String(n).padStart(2, '0');
  for (const r of records) {
    const d = new Date(r.timestamp);
    rows.push([
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      'CET',
      r.glucose, r.glucose_unit, r.ketones, r.gki,
      r.note ? r.note.replace(/\n/g, ' ') : '',
    ]);
  }
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(sep)).join('\n');
}
