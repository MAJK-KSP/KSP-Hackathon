import dotenv from 'dotenv';
dotenv.config({ override: true });

import { getAllRows } from './backend-node/db';

async function main() {
  try {
    const users = await getAllRows('SELECT id, email, mfa_enabled FROM users');
    console.log('Users in DB:', users);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
