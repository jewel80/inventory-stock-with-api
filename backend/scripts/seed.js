require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { runSync } = require('../src/services/syncService');

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding database...');

  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!existing) {
    const hash = await bcrypt.hash('password', 10);
    await prisma.user.create({ data: { username: 'admin', password: hash } });
    console.log('Created admin user (username: admin, password: password)');
  } else {
    console.log('Admin user already exists, skipping creation');
  }

  console.log('Running initial product sync from supplier API...');
  const result = await runSync();
  console.log(`Sync complete: ${result.created} created, ${result.updated} updated`);
  if (result.errors.length > 0) {
    console.warn('Sync completed with errors:', result.errors);
  }

  await prisma.$disconnect();
  console.log('Done.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
