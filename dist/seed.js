"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const auth_1 = require("./auth");
async function seed() {
    const email = process.argv[2];
    const password = process.argv[3];
    if (!email || !password) {
        console.error('Error: Please provide email and password.');
        console.log('Usage: npx ts-node src/seed.ts <email> <password>');
        process.exit(1);
    }
    // Validate email format
    if (!email.includes('@') || !email.includes('.')) {
        console.error('Error: Invalid email format.');
        process.exit(1);
    }
    // Validate password format using our security schema
    try {
        auth_1.passwordSchema.parse(password);
    }
    catch (error) {
        console.error('Error: Password does not meet security requirements:');
        console.error(error.errors ? error.errors.map((e) => `- ${e.message}`).join('\n') : error.message);
        process.exit(1);
    }
    try {
        console.log('Initializing database...');
        await (0, db_1.initDb)();
        // Check if user already exists
        const existingUser = await (0, db_1.getRow)('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser) {
            console.error(`Error: User with email "${email}" already exists.`);
            process.exit(1);
        }
        const userId = crypto.randomUUID();
        const passwordHash = await (0, auth_1.hashPassword)(password);
        const createdAt = new Date().toISOString();
        console.log('Creating user in database...');
        await (0, db_1.runQuery)(`INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`, [userId, email, passwordHash, createdAt]);
        console.log('\n=============================================');
        console.log('🎉 SUCCESS: Admin Account Created Successfully!');
        console.log('=============================================');
        console.log(`Email:      ${email}`);
        console.log(`User ID:    ${userId}`);
        console.log('MFA Status: Pending setup on first login');
        console.log('=============================================\n');
        process.exit(0);
    }
    catch (error) {
        console.error('Failed to seed user:', error);
        process.exit(1);
    }
}
seed();
