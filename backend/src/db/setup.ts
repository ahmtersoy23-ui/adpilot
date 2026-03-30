import fs from 'fs';
import path from 'path';
import { pool } from './connection';

async function setupDatabase() {
  console.log('🚀 Setting up database schema...\n');

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute schema
    await pool.query(schema);

    console.log('✅ Database schema created successfully\n');

    // Verify tables
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📊 Created tables:');
    result.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });

    console.log('\n✨ Database setup complete!\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    await pool.end();
    process.exit(1);
  }
}

setupDatabase();
