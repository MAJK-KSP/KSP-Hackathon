import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ override: true });

async function main() {
  const sql = postgres({
    host: 'aws-0-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    username: 'postgres.elvwfsventokcoetasut',
    password: process.env.DB_PASSWORD,
    ssl: 'require',
  });

  try {
    console.log('--- Checking tables in public schema ---');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('Tables:', tables.map(t => t.table_name));

    for (const table of tables) {
      const tableName = table.table_name;
      console.log(`\n--- Schema of table: ${tableName} ---`);
      const columns = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = ${tableName}
      `;
      console.log(columns.map(c => `${c.column_name} (${c.data_type})`).join(', '));

      console.log(`\n--- First 3 rows of ${tableName} ---`);
      const rows = await sql`
        SELECT * FROM public.${sql(tableName)} LIMIT 3
      `;
      console.log(rows);
    }
  } catch (err: any) {
    console.error('Error:', err.message || err);
  } finally {
    await sql.end();
  }
}

main();
