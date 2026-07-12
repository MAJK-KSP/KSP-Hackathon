import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ override: true });

async function main() {
  const sql = postgres({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: 'require',
  });

  try {
    const users = await sql`SELECT email FROM users`;
    console.log('Users:', users);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

main();
