import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ override: true });

async function main() {
  console.log('Testing connection with the NEW password...');
  const sql = postgres({
    host: 'aws-0-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    username: 'postgres.elvwfsventokcoetasut',
    password: process.env.DB_PASSWORD,
    ssl: 'require',
    connect_timeout: 5,
  });

  try {
    const result = await sql`SELECT 1 as connected`;
    console.log(`SUCCESS with new password:`, result);
  } catch (err: any) {
    console.error(`FAILED with new password:`, err.message || err);
  } finally {
    await sql.end();
  }
}

main();
