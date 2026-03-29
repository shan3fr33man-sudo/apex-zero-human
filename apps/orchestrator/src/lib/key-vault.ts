/**
 * Key Vault — BYOK encryption, decryption, and verification.
 *
 * Uses AES-256-GCM with ENCRYPTION_SECRET env var.
 * Every tenant must provide their own Claude API key.
 * APEX never uses its own key for tenant agent runs.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './supabase.js';
import { createLogger } from './logger.js';

const log = createLogger('KeyVault');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionSecret(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      '[KeyVault] ENCRYPTION_SECRET must be set and at least 32 characters. ' +
      'Generate one: openssl rand -hex 16'
    );
  }
  // Use first 32 bytes as the key
  return Buffer.from(secret.slice(0, 32), 'utf8');
}

/**
 * Encrypt a plaintext API key for storage.
 * Format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encryptKey(plaintext: string): string {
  const key = getEncryptionSecret();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted API key from storage.
 */
export function decryptKey(encrypted: string): string {
  const key = getEncryptionSecret();
  const parts = encrypted.split(':');

  if (parts.length !== 3) {
    throw new Error('[KeyVault] Invalid encrypted key format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Verify a Claude API key is valid by making a minimal test call.
 */
export async function verifyClaudeKey(apiKey: string): Promise<boolean> {
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say "ok"' }],
    });
    return response.content.length > 0;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      log.warn('Claude API key verification failed: invalid key');
      return false;
    }
    // Other errors (rate limit, network) — don't assume key is bad
    log.error('Claude API key verification error', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Get the decrypted Claude API key for a company.
 * Resolves: company → organization → api_key_encrypted.
 */
export async function getDecryptedKeyForCompany(companyId: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  // Traverse: company → org
  const { data: company } = await supabase
    .from('companies')
    .select('org_id')
    .eq('id', companyId)
    .single();

  if (!company) throw new BYOKRequiredError('Company not found');

  return getDecryptedKeyForOrg(company.org_id);
}

/**
 * Get the decrypted Claude API key for an organization.
 */
export async function getDecryptedKeyForOrg(orgId: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data: org } = await supabase
    .from('organizations')
    .select('api_key_encrypted, byok_verified')
    .eq('id', orgId)
    .single();

  if (!org || !org.api_key_encrypted) {
    throw new BYOKRequiredError(
      'No Claude API key configured. Add your key in Settings → API Keys.'
    );
  }

  if (!org.byok_verified) {
    throw new BYOKRequiredError(
      'Claude API key has not been verified. Please verify your key in Settings → API Keys.'
    );
  }

  try {
    return decryptKey(org.api_key_encrypted);
  } catch (err) {
    log.error('Failed to decrypt org key', { orgId });
    throw new BYOKRequiredError('Failed to decrypt API key. Please re-enter your key.');
  }
}

/**
 * Custom error for BYOK issues — caught by the ModelRouter to handle gracefully.
 */
export class BYOKRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BYOKRequiredError';
  }
}
