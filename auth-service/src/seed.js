'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { config, missingEnv } = require('./config');
const Clinic = require('./models/Clinic');
const UserRegistry = require('./models/UserRegistry');
const { getUserSchema } = require('./schemas/user');

const clinics = [
  {
    clinicId: 'clinic-sunrise',
    name: 'Sunrise Medical Center',
    address: '123 Health Ave, New York, NY 10001',
    dbName: 'patient_tracker_clinic_sunrise',
  },
  {
    clinicId: 'clinic-bayview',
    name: 'Bayview Family Clinic',
    address: '456 Wellness Blvd, San Francisco, CA 94102',
    dbName: 'patient_tracker_clinic_bayview',
  },
];

const users = [
  {
    username: 'dr.smith',
    password: 'password123',
    fullName: 'Dr. Sarah Smith',
    clinicId: 'clinic-sunrise',
    role: 'doctor',
  },
  {
    username: 'nurse.jones',
    password: 'password123',
    fullName: 'Nurse Mike Jones',
    clinicId: 'clinic-sunrise',
    role: 'nurse',
  },
  {
    username: 'dr.chen',
    password: 'password123',
    fullName: 'Dr. Lisa Chen',
    clinicId: 'clinic-bayview',
    role: 'doctor',
  },
  {
    username: 'admin.lee',
    password: 'password123',
    fullName: 'Admin Kevin Lee',
    clinicId: 'clinic-bayview',
    role: 'admin',
  },
];

async function seed() {
  const missing = missingEnv();
  if (missing.length > 0) {
    console.error(`Auth seed: missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const clinicConnections = [];

  try {
    await mongoose.connect(config.registryUri);
    console.log('Connected to registry database');

    await Clinic.deleteMany({});
    await UserRegistry.deleteMany({});
    console.log('Cleared registry data');

    await Clinic.insertMany(clinics);
    console.log(`Seeded ${clinics.length} clinics in registry`);

    const registryEntries = users.map((u) => ({
      username: u.username,
      clinicId: u.clinicId,
    }));
    await UserRegistry.insertMany(registryEntries);
    console.log(`Seeded ${registryEntries.length} user registry entries`);

    for (const clinic of clinics) {
      const conn = mongoose.createConnection(`${config.baseUri}/${clinic.dbName}`);
      clinicConnections.push(conn);

      await conn.asPromise();
      console.log(`\nConnected to clinic DB: ${clinic.dbName}`);

      const User = conn.model('User', getUserSchema());

      await User.deleteMany({});
      console.log(`  Cleared users in ${clinic.dbName}`);

      const clinicUsers = users.filter((u) => u.clinicId === clinic.clinicId);
      for (const userData of clinicUsers) {
        await User.create(userData);
      }
      console.log(`  Seeded ${clinicUsers.length} users`);
    }

    console.log('\n--- Auth Seed Complete ---');
    console.log('Test Credentials:');
    clinics.forEach((c) => {
      console.log(`\n  ${c.name} (${c.clinicId}) -> DB: ${c.dbName}`);
      users
        .filter((u) => u.clinicId === c.clinicId)
        .forEach((u) => {
          console.log(`    Username: ${u.username} | Password: ${u.password} | Role: ${u.role}`);
        });
    });

    for (const conn of clinicConnections) {
      await conn.close();
    }
    await mongoose.disconnect();
  } catch (error) {
    console.error('Auth seed error:', error.name, error.message);
    for (const conn of clinicConnections) {
      await conn.close().catch(() => {});
    }
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

seed();
