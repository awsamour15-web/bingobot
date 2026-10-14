import fs from 'fs';
const files = [
  'backup_2026-08-22T05-59-00.json',
  'backup_2026-08-22T19-55-00.json',
  'backup_2026-09-13T10-21-39.json',
  'backup_2026-09-15T06-08-52.json',
  'backup_2026-09-20T08-03-27.json',
];
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync('apps/backend/backups/' + f, 'utf8'));
    const counts = Object.entries(d)
      .filter(([k, v]) => Array.isArray(v) && v.length > 0)
      .map(([k, v]) => `${k}:${v.length}`)
      .join(', ');
    console.log('✓ ' + f + '\n  => ' + counts);
  } catch (e) {
    console.log('✗ ' + f + '\n  => ' + e.message.split('\n')[0]);
  }
}
