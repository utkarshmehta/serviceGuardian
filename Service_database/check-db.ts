/**
 * A utility script to check the contents of the 'people' table.
 * This is useful for debugging and verifying the database setup.
 * * To run (from /server folder):
 * npx ts-node src/scripts/check-db.ts
 */
import db from '../database';

console.log('Running database check script...');

const sql = 'SELECT * FROM people;';

db.all(
  sql, [], (err: Error | null, rows: any[]) => {
  if (err) {
    return console.error('Error fetching people:', err.message);
  }

  console.log('--- People Table Check ---');
  console.log(`Found ${rows.length} rows.`);
  console.log('Data:', rows);
  console.log('--------------------------');
});

db.close((err: Error | null) => {
  if (err) {
    return console.error('Error closing database', err.message);
  }
  console.log('Database connection closed.');
});
