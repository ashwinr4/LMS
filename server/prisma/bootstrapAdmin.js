import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/utils/prisma.js';
import { logger } from '../src/utils/logger.js';

const FORBIDDEN_PASSWORDS = [
  'admin',
  'admin123',
  'password',
  'password123',
  '12345678',
  '123456789',
  'qualiva',
  'qualiva123',
  'P@ssword123',
  'Admin@123',
];

export async function bootstrapAdministrator() {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const adminName = (process.env.ADMIN_NAME || 'System Administrator').trim();
  const adminDept = (process.env.ADMIN_DEPARTMENT || 'Platform Engineering').trim();

  if (!adminEmail || !adminPassword) {
    console.log('\n===============================================================');
    console.log('ℹ️  QUALIVA LMS — Administrator Bootstrap Procedure');
    console.log('===============================================================');
    console.log('To provision or verify an initial administrator account safely:');
    console.log('  1. Provide environment variables:');
    console.log('       ADMIN_EMAIL="admin@yourdomain.com"');
    console.log('       ADMIN_PASSWORD="YourStrongUniquePassword123!"');
    console.log('       ADMIN_NAME="System Administrator" (optional)');
    console.log('       FORCE_ADMIN_PASSWORD_RESET="true" (optional: to reset an existing admin password)');
    console.log('       FORCE_ADMIN_PROMOTION="true" (optional: to promote an existing non-admin account)');
    console.log('  2. Run: npm run admin:bootstrap');
    console.log('  * Note: Routine runs are idempotent and never reset an existing admin password.');
    console.log('===============================================================\n');
    return { success: false, reason: 'CREDENTIALS_NOT_PROVIDED' };
  }

  // 1. Enforce password complexity requirements
  if (adminPassword.length < 10) {
    throw new Error('SECURITY VIOLATION: Administrator bootstrap password must be at least 10 characters long.');
  }

  if (FORBIDDEN_PASSWORDS.includes(adminPassword) || FORBIDDEN_PASSWORDS.includes(adminPassword.toLowerCase())) {
    throw new Error('SECURITY VIOLATION: Insecure/default password detected. You must provide a unique, non-trivial administrator password.');
  }

  // 2. Check if administrator or user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingUser) {
    if (existingUser.role === 'ADMIN') {
      console.log(`ℹ️ Administrator account already active for: ${adminEmail}`);
      
      // If FORCE_ADMIN_PASSWORD_RESET=true is provided by the operator, update the password safely
      if (process.env.FORCE_ADMIN_PASSWORD_RESET === 'true') {
        const newHash = await bcrypt.hash(adminPassword, 12);
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash: newHash,
            status: 'ACTIVE',
            mustChangePassword: false,
            failedLoginAttempts: 0,
            lockUntil: null,
          },
        });
        console.log(`✅ Administrator credentials explicitly reset for: ${adminEmail}`);
        return { success: true, action: 'ADMIN_PASSWORD_RESET', email: adminEmail };
      }

      console.log(`🔒 Existing administrator password preserved (set FORCE_ADMIN_PASSWORD_RESET=true to change).`);
      return { success: true, action: 'EXISTING_ADMIN_RETAINED', email: adminEmail };
    }

    // Require explicit confirmation before promoting an existing non-admin account
    if (process.env.FORCE_ADMIN_PROMOTION !== 'true') {
      console.log(`⚠️ An existing account with role "${existingUser.role}" was found for: ${adminEmail}.`);
      console.log('   To prevent accidental account changes, promotion requires explicit operator confirmation.');
      console.log('   Set FORCE_ADMIN_PROMOTION="true" to promote this account to ADMIN and update credentials.');
      return {
        success: false,
        reason: 'ACCOUNT_EXISTS_NON_ADMIN',
        role: existingUser.role,
        email: adminEmail,
      };
    }

    // Promote existing user to administrator safely when explicitly confirmed
    const newHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordHash: newHash,
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockUntil: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: existingUser.id,
        actorEmail: adminEmail,
        actorName: existingUser.name,
        action: 'ADMIN_BOOTSTRAP_PROMOTED',
        resource: 'AUTH',
        details: `Existing account promoted to ADMIN via operator bootstrap procedure`,
        riskLevel: 'HIGH',
      },
    });

    console.log(`✅ Existing account successfully promoted to Administrator: ${adminEmail}`);
    return { success: true, action: 'USER_PROMOTED', email: adminEmail };
  }

  // 3. Create fresh administrator account
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const newAdmin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      department: adminDept,
      mustChangePassword: false,
      isFirstLogin: false,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: newAdmin.id,
      actorEmail: adminEmail,
      actorName: adminName,
      action: 'ADMIN_BOOTSTRAP_CREATED',
      resource: 'AUTH',
      details: 'Initial system administrator initialized via secure operator bootstrap procedure',
      riskLevel: 'HIGH',
    },
  });

  console.log(`✅ System Administrator successfully provisioned: ${adminEmail}`);
  return { success: true, action: 'ADMIN_CREATED', email: adminEmail };
}

// Direct execution entrypoint
if (process.argv[1]?.endsWith('bootstrapAdmin.js')) {
  bootstrapAdministrator()
    .catch((err) => {
      console.error(`❌ Administrator Bootstrap Failed: ${err.message}`);
      process.exit(1);
    })
    .finally(async () => {
      if (prisma.$disconnect) await prisma.$disconnect();
    });
}
