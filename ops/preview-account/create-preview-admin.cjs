const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const appRoot = process.env.APP_ROOT || '/opt/zhimei-education-platform/app';
const envFile = process.env.API_ENV_FILE || '/opt/zhimei-education-platform/shared/api.env';
const metadataFile = process.env.METADATA_FILE || '/etc/zhike-preview-account.json';
const credentialFile = process.env.CREDENTIAL_FILE || '/tmp/zhike-preview-admin-credentials.json';
const dropInFile = process.env.DROP_IN_FILE || '/etc/systemd/system/meiyu-api.service.d/readonly-preview.conf';
const timerFile = process.env.TIMER_FILE || '/etc/systemd/system/zhike-preview-account-expiry.timer';

Object.assign(process.env, dotenv.parse(fs.readFileSync(envFile, 'utf8')));

const prisma = new PrismaClient();

function compactDate(date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function systemdCalendar(date) {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

async function main() {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 72 * 60 * 60 * 1000);
  const suffix = crypto.randomBytes(3).toString('hex');
  const username = `preview_admin_${compactDate(createdAt)}_${suffix}`;
  const email = `${username}@preview.local`;
  const password = crypto.randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 12);

  const previousUsers = await prisma.user.findMany({
    where: { username: { startsWith: 'preview_admin_' } },
    select: { id: true },
  });
  const previousIds = previousUsers.map((user) => user.id);

  await prisma.$transaction(async (tx) => {
    if (previousIds.length) {
      await tx.user.updateMany({
        where: { id: { in: previousIds } },
        data: { status: 'DISABLED' },
      });
      await tx.refreshToken.deleteMany({ where: { userId: { in: previousIds } } });
      await tx.authorizationCode.deleteMany({ where: { userId: { in: previousIds } } });
      await tx.passwordResetToken.deleteMany({ where: { userId: { in: previousIds } } });
    }

    await tx.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName: '三日只读管理员',
        userType: 'ADMIN',
        approvalStatus: 'APPROVED',
        status: 'ACTIVE',
        isPlatformAdmin: true,
      },
    });
  });

  fs.mkdirSync(path.dirname(dropInFile), { recursive: true });
  fs.writeFileSync(
    dropInFile,
    `[Service]\nEnvironment="READ_ONLY_PREVIEW_USERS=${username}"\nEnvironment="READ_ONLY_PREVIEW_EXPIRES_AT=${expiresAt.toISOString()}"\n`,
    { mode: 0o644 },
  );
  fs.chmodSync(dropInFile, 0o644);

  fs.writeFileSync(
    timerFile,
    `[Unit]\nDescription=Expire the temporary Zhike read-only preview account after 72 hours\n\n[Timer]\nOnCalendar=${systemdCalendar(expiresAt)}\nAccuracySec=1s\nPersistent=true\nUnit=zhike-preview-account-expiry.service\n\n[Install]\nWantedBy=timers.target\n`,
    { mode: 0o644 },
  );
  fs.chmodSync(timerFile, 0o644);

  fs.writeFileSync(metadataFile, JSON.stringify({ username, expiresAt: expiresAt.toISOString() }, null, 2), {
    mode: 0o600,
  });
  fs.chmodSync(metadataFile, 0o600);

  fs.writeFileSync(
    credentialFile,
    JSON.stringify(
      {
        loginUrl: 'https://data.docpine.online',
        username,
        password,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        mode: '只读管理员，禁止新增、修改、删除、发布、启动课件和保存成绩',
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  fs.chmodSync(credentialFile, 0o600);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

