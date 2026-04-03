#!/usr/bin/env node
/**
 * store-byok-key.mjs
 *
 * Encrypts the ANTHROPIC_API_KEY using ENCRYPTION_SECRET (matching key-vault.ts logic)
 * and stores it in the organizations table for BYOK.
 *
 * Run from apps/orchestrator/ with: node -r dotenv/config ../../scripts/store-byok-key.mjs
 * Or from project root with env vars already set.
 */
import { createCipheriv, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// --- Config ---
const ORG_ID = '00000000-0000-0000-0000-000000000001';

// --- Read env ---
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ENCRYPTION_SECRET || ENCRYPTION_SECRET.length < 32) {
  console.error('ERROR: ENCRYPTION_SECRET must be set and at least 32 chars');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY must be set');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

// --- Encrypt (matches key-vault.ts exactly) ---
function encryptKey(plaintext) {
  const key = Buffer.from(ENCRYPTION_SECRET.slice(0, 32), 'utf8');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

const encryptedKey = encryptKey(ANTHROPIC_API_KEY);
console.log('Encrypted key length:', encryptedKey.length);
console.log('Format check (3 hex parts):', encryptedKey.split(':').length === 3 ? 'OK' : 'FAIL');

// --- Store in DB ---
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from('organizations')
  .update({
    api_key_encrypted: encryptedKey,
    byok_verified: true,
  })
  .eq('id', ORG_ID)
  .select('id, name, byok_verified');

if (error) {
  console.error('DB update error:', error.message);
  process.exit(1);
}

console.log('SUCCESS — Organization updated:', JSON.stringify(data, null, 2));
console.log('BYOK key stored and verified for org:', ORG_ID);
