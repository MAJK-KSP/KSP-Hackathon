/**
 * @file seed.ts
 * @description Database seeding script. Used to initialize the SQLite database and create a default admin user.
 * Part of the Node.js backend.
 */

import { initDb, getRow, runQuery } from '../config/db';
import { hashPassword, passwordSchema } from '../services/auth';

async function seed() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Error: Please provide email and password.');
    console.log('Usage: npx ts-node backend/node/scripts/seed.ts <email> <password>');
    process.exit(1);
  }

  // Validate email format
  if (!email.includes('@') || !email.includes('.')) {
    console.error('Error: Invalid email format.');
    process.exit(1);
  }

  // Validate password format using our security schema
  try {
    passwordSchema.parse(password);
  } catch (error: any) {
    console.error('Error: Password does not meet security requirements:');
    console.error(error.errors ? error.errors.map((e: any) => `- ${e.message}`).join('\n') : error.message);
    process.exit(1);
  }

  try {
    console.log('Initializing database...');
    await initDb();

    // Check if user already exists
    const existingUser = await getRow('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      console.error(`Error: User with email "${email}" already exists.`);
      process.exit(1);
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const createdAt = new Date().toISOString();

    console.log('Creating user in database...');
    await runQuery(
      `INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
      [userId, email, passwordHash, createdAt]
    );

    // Assign admin role to the seeded user
    console.log('Assigning admin role...');
    await runQuery(
      `INSERT INTO user_roles (user_id, role, assigned_at) VALUES (?, 'admin', ?)`,
      [userId, createdAt]
    );

    console.log('\n=============================================');
    console.log('🎉 SUCCESS: Admin Account Created Successfully!');
    console.log('=============================================');
    console.log(`Email:      ${email}`);
    console.log(`User ID:    ${userId}`);
    console.log(`Role:       admin`);
    console.log('MFA Status: Pending setup on first login');
    console.log('=============================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Failed to seed user:', error);
    process.exit(1);
  }
}

seed();
