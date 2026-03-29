import { describe, it, expect, beforeAll } from 'vitest';

// Set encryption secret before importing key-vault
process.env.ENCRYPTION_SECRET = 'test-encryption-secret-32chars!!';

import { encryptKey, decryptKey, BYOKRequiredError } from '../lib/key-vault.js';

describe('Key Vault — BYOK encryption/decryption', () => {
  it('encrypts and decrypts a key correctly', () => {
    const plaintext = 'sk-ant-api03-test-key-1234567890';
    const encrypted = encryptKey(plaintext);
    const decrypted = decryptKey(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for the same key (random IV)', () => {
    const plaintext = 'sk-ant-api03-same-key';
    const a = encryptKey(plaintext);
    const b = encryptKey(plaintext);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decryptKey(a)).toBe(plaintext);
    expect(decryptKey(b)).toBe(plaintext);
  });

  it('encrypted output has correct format (iv:authTag:ciphertext)', () => {
    const encrypted = encryptKey('test-key');
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3);
    // IV is 16 bytes = 32 hex chars
    expect(parts[0].length).toBe(32);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1].length).toBe(32);
    // Ciphertext is non-empty
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('throws on invalid encrypted format', () => {
    expect(() => decryptKey('invalid')).toThrow('Invalid encrypted key format');
    expect(() => decryptKey('a:b')).toThrow('Invalid encrypted key format');
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encryptKey('test-key');
    const parts = encrypted.split(':');
    // Tamper with ciphertext
    parts[2] = 'ff' + parts[2].slice(2);
    expect(() => decryptKey(parts.join(':'))).toThrow();
  });

  it('handles empty string encryption', () => {
    const encrypted = encryptKey('');
    const decrypted = decryptKey(encrypted);
    expect(decrypted).toBe('');
  });

  it('handles long keys', () => {
    const longKey = 'sk-ant-api03-' + 'a'.repeat(500);
    const encrypted = encryptKey(longKey);
    const decrypted = decryptKey(encrypted);
    expect(decrypted).toBe(longKey);
  });

  it('BYOKRequiredError is an instance of Error', () => {
    const err = new BYOKRequiredError('test message');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BYOKRequiredError');
    expect(err.message).toBe('test message');
  });
});
