import { jest } from '@jest/globals';
import '@testing-library/jest-dom';

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

import axios from 'axios';
import httpAdapter from 'axios/lib/adapters/http.js';
import dotenv from 'dotenv';

jest.setTimeout(60000);

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFilePath), '..', '..');

dotenv.config({ path: path.join(repoRoot, 'server/.env'), override: false });

if (!process.env.MONGO_URI) {
  throw new Error('Frontend integration tests require MONGO_URI to be defined.');
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'integration-test-secret';
}

const apiBaseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:4000/api';
const createdPerkIds = new Set();

// Ensure axios works under Node/Jest (no browser XHR)
axios.defaults.adapter = httpAdapter;

beforeAll(async () => {
  // Bare axios for auth/bootstrapping calls
  const http = axios.create({ baseURL: apiBaseUrl });

  // Create a unique test user for this suite
  const credentials = {
    name: `UI Test User ${crypto.randomUUID()}`,
    email: `ui.tester.${Date.now()}@example.com`,
    password: 'UITest-StrongPass1!'
  };

  const registration = await http.post('/auth/register', credentials);
  const registrationPayload = registration.data;

  // Use the app's shared axios instance so interceptors (e.g., auth) apply
  const { api } = await import('../src/api.js');
  api.defaults.baseURL = apiBaseUrl;

  // Store token so the frontend api instance can attach Authorization
  window.localStorage.setItem('token', registrationPayload.token);

  // Baseline seed payload
  const seedBase = {
    title: 'Integration Preview Benefit',
    description:
      'Baseline record created during setup for deterministic rendering checks.',
    category: 'travel',
    merchant: 'Integration Merchant',
    discountPercent: 15
  };

  // Idempotent seed: if it already exists (409), retry with a unique title
  let seededPerk;
  try {
    const seedPerkResponse = await api.post('/perks', seedBase);
    seededPerk = seedPerkResponse.data.perk;
  } catch (err) {
    if (err?.response?.status === 409) {
      const uniqueTitle = `${seedBase.title} ${crypto.randomUUID().slice(0, 8)}`;
      const retryResponse = await api.post('/perks', {
        ...seedBase,
        title: uniqueTitle
      });
      seededPerk = retryResponse.data.perk;
    } else {
      throw err;
    }
  }

  if (seededPerk?._id) {
    createdPerkIds.add(seededPerk._id);
  }

  // Expose useful objects to tests
  global.__TEST_CONTEXT__ = {
    baseUrl: apiBaseUrl,
    credentials,
    token: registrationPayload.token,
    user: registrationPayload.user,
    seededPerk,
    api,
    createdPerkIds
  };
});

afterAll(async () => {
  const context = global.__TEST_CONTEXT__;

  if (context) {
    const authHeaders = { Authorization: `Bearer ${context.token}` };

    const http = axios.create({
      baseURL: context.baseUrl,
      headers: authHeaders
    });

    // Best-effort cleanup of any perks we created during this suite
    await Promise.all(
      Array.from(context.createdPerkIds).map((perkId) =>
        http.delete(`/perks/${perkId}`).catch(() => {})
      )
    );

    await removeTestUser(context.credentials.email);
  }

  window.localStorage.clear();
});

async function removeTestUser(email) {
  if (!email) return;

  const script = `
    import mongoose from 'mongoose';
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error('Missing MONGO_URI for cleanup script');
    }
    await mongoose.connect(uri, { autoIndex: true });
    await mongoose.connection.collection('users').deleteOne({ email: '${email.toLowerCase()}' });
    await mongoose.disconnect();
  `;

  await new Promise((resolve, reject) => {
    const cleanup = spawn(process.execPath, ['--input-type=module', '-'], {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    cleanup.stdin.write(script);
    cleanup.stdin.end();

    cleanup.stdout.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.log(`[cleanup stdout] ${text}`);
    });
    cleanup.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.error(`[cleanup stderr] ${text}`);
    });

    cleanup.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Failed to remove the test user after the suite finished.'));
    });
  });
}