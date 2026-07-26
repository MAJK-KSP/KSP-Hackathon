import { runQuery, getAllRows, initDb } from '../config/db';
import { hashPassword } from '../services/auth';

async function resetPasswords() {
  try {
    await initDb();
    const newPassword = 'Aq!234567890';
    const newHash = await hashPassword(newPassword);

    console.log('Generated hash for Aq!234567890:', newHash);

    const users = await getAllRows<{ id: string; email: string }>('SELECT id, email FROM users;');

    for (const u of users) {
      await runQuery('UPDATE users SET password_hash = ? WHERE id = ?;', [newHash, u.id]);
      console.log(`Updated password for ${u.email} -> Aq!234567890`);
    }

    console.log('\nAll users successfully updated with password: Aq!234567890');
    process.exit(0);
  } catch (err) {
    console.error('Error resetting passwords:', err);
    process.exit(1);
  }
}

resetPasswords();
