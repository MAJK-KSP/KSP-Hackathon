import { runQuery, getAllRows } from '../config/db';
import { hashPassword } from '../services/auth';

async function resetPasswords() {
  try {
    const newPassword = 'Admin@12345';
    const newHash = await hashPassword(newPassword);

    console.log('Generated hash for Admin@12345:', newHash);

    const users = await getAllRows<{ id: string; email: string }>('SELECT id, email FROM users;');

    for (const u of users) {
      await runQuery('UPDATE users SET password_hash = ? WHERE id = ?;', [newHash, u.id]);
      console.log(`Updated password for ${u.email} -> Admin@12345`);
    }

    console.log('\nAll users successfully updated with password: Admin@12345');
  } catch (err) {
    console.error('Error resetting passwords:', err);
  }
}

resetPasswords();
