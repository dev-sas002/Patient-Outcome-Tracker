const { execSync } = require('child_process');
const path = require('path');

console.log('===========================================');
console.log('  Patient Outcome Tracker - Seed Script');
console.log('===========================================\n');

try {
  console.log('[1/2] Seeding Auth Service (clinics & users)...\n');
  execSync('node src/seed.js', {
    cwd: path.join(__dirname, 'auth-service'),
    stdio: 'inherit',
  });

  console.log('\n[2/2] Seeding Outcome Service (patient outcomes)...\n');
  execSync('node src/seed.js', {
    cwd: path.join(__dirname, 'outcome-service'),
    stdio: 'inherit',
  });

  console.log('\n===========================================');
  console.log('  All seed data loaded successfully!');
  console.log('===========================================\n');
} catch (error) {
  console.error('\nSeed failed:', error.message);
  process.exit(1);
}
