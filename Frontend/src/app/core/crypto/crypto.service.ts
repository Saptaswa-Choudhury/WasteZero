import { Injectable } from '@angular/core';
import { argon2id } from 'hash-wasm';

/**
 * End-to-end encryption for direct messages.
 *
 * How it works:
 *  - Every account has an RSA-OAEP (2048-bit) key pair. The private key is
 *    generated in the browser and NEVER leaves it in plaintext - it's
 *    persisted locally in IndexedDB. Only the public key is ever sent to the
 *    server, so the backend can hand it out to other users but can never
 *    decrypt anything.
 *  - Each message gets its own random AES-256-GCM key. The message body is
 *    encrypted with that key, and the key itself is then "wrapped" (RSA-OAEP
 *    encrypted) twice: once with the receiver's public key, once with the
 *    sender's public key. That's what lets both sides read their own copy of
 *    a conversation while the server only ever stores/relays ciphertext.
 *
 * Multi-device key backup:
 *  - The first time a device generates a key pair for an account, it also
 *    derives a Key Encryption Key (KEK) from the account password using
 *    Argon2id, uses that KEK to AES-GCM encrypt the key pair, and uploads
 *    the resulting ciphertext (plus the Argon2id salt/params) to the server.
 *  - The password and the KEK derived from it NEVER leave the browser -
 *    only the encrypted key pair and the (non-secret) salt are sent. The
 *    server can store the blob but has no way to decrypt it.
 *  - When the account is opened on a second device that has no local key
 *    pair yet, that device fetches the encrypted backup, re-derives the same
 *    KEK from the password the user just typed in to log in, and decrypts
 *    the ORIGINAL key pair into its own IndexedDB - instead of generating a
 *    new, history-incompatible one.
 */

interface StoredKeyPair {
  userId: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  encryptedKeyForSender: string;
  encryptedKeyForReceiver: string;
}

export interface KdfParams {
  algorithm: 'argon2id';
  memoryCost: number; // KiB
  timeCost: number; // iterations
  parallelism: number;
  hashLength: number; // bytes
}

export interface KeyBackupPayload {
  ciphertext: string;
  iv: string;
  salt: string;
  kdf: KdfParams;
}

const DB_NAME = 'wastezero_e2ee';
const DB_VERSION = 1;
const STORE_NAME = 'keypairs';
const RSA_ALGO: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256'
};

// Argon2id parameters for deriving the KEK from the account password.
// ~64 MiB memory + 3 passes is comfortably within OWASP's recommended
// minimums for interactive login-time hashing and runs in well under a
// second in modern browsers, while being expensive enough to resist
// offline brute-forcing of a stolen key-backup blob.
const KDF_PARAMS: KdfParams = {
  algorithm: 'argon2id',
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
  hashLength: 32 // 256-bit AES key
};
const SALT_BYTES = 16;

@Injectable({ providedIn: 'root' })
export class CryptoService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  // In-memory caches so we don't re-import keys from IndexedDB / re-parse
  // JWKs on every single message.
  private privateKeyCache = new Map<string, CryptoKey>();
  private ownPublicKeyCache = new Map<string, CryptoKey>();
  private otherPublicKeyCache = new Map<string, CryptoKey>();

  // ---------- IndexedDB plumbing ----------

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  private async getStoredKeyPair(userId: string): Promise<StoredKeyPair | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(userId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  private async putStoredKeyPair(record: StoredKeyPair): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------- key pair lifecycle ----------

  /**
   * Returns the caller's public key (as a JSON string, ready to upload/store
   * on the backend), generating and persisting a fresh key pair locally the
   * first time it's called for this userId on this device.
   */
  async ensureKeyPair(userId: string): Promise<string> {
    const existing = await this.getStoredKeyPair(userId);
    if (existing) {
      return JSON.stringify(existing.publicKeyJwk);
    }

    const keyPair = await crypto.subtle.generateKey(RSA_ALGO, true, ['encrypt', 'decrypt']);
    const [publicKeyJwk, privateKeyJwk] = await Promise.all([
      crypto.subtle.exportKey('jwk', keyPair.publicKey),
      crypto.subtle.exportKey('jwk', keyPair.privateKey)
    ]);

    await this.putStoredKeyPair({ userId, publicKeyJwk, privateKeyJwk });

    this.privateKeyCache.set(userId, keyPair.privateKey);
    this.ownPublicKeyCache.set(userId, keyPair.publicKey);

    return JSON.stringify(publicKeyJwk);
  }

  /** True if this device already has a locally-generated key pair for this user. */
  async hasLocalKeyPair(userId: string): Promise<boolean> {
    return !!(await this.getStoredKeyPair(userId));
  }

  // ---------- password-wrapped key backup (multi-device recovery) ----------

  /**
   * Derives a Key Encryption Key from the account password via Argon2id.
   * This is the only place the plaintext password is touched by the crypto
   * layer, and the result never leaves the browser.
   */
  private async deriveKEK(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const derivedHex = await argon2id({
      password,
      salt,
      memorySize: KDF_PARAMS.memoryCost,
      iterations: KDF_PARAMS.timeCost,
      parallelism: KDF_PARAMS.parallelism,
      hashLength: KDF_PARAMS.hashLength,
      outputType: 'hex'
    });

    const rawKey = this.hexToBuffer(derivedHex);
    return crypto.subtle.importKey('raw', rawKey.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt'
    ]);
  }

  /**
   * Encrypts this device's local key pair for `userId` with a KEK derived
   * from `password`, ready to upload to the server as a recovery backup.
   * Returns null if this device has no local key pair to back up.
   */
  async createKeyBackup(userId: string, password: string): Promise<KeyBackupPayload | null> {
    const stored = await this.getStoredKeyPair(userId);
    if (!stored) return null;

    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const kek = await this.deriveKEK(password, salt);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(
      JSON.stringify({ publicKeyJwk: stored.publicKeyJwk, privateKeyJwk: stored.privateKeyJwk })
    );
    const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, plaintext);

    return {
      ciphertext: this.bufferToBase64(ciphertextBuffer),
      iv: this.bufferToBase64(iv.buffer),
      salt: this.bufferToBase64(salt.buffer),
      kdf: KDF_PARAMS
    };
  }

  /**
   * Decrypts a key backup fetched from the server using a KEK re-derived
   * from `password`, and writes the recovered key pair into this device's
   * IndexedDB (and in-memory caches) under `userId`. Returns false (rather
   * than throwing) if the password doesn't unlock the backup - e.g. it's
   * stale after a password change, or the user mistyped their password.
   */
  async restoreKeyBackup(userId: string, password: string, backup: KeyBackupPayload): Promise<boolean> {
    try {
      const salt = new Uint8Array(this.base64ToBuffer(backup.salt));
      const kek = await this.deriveKEK(password, salt);

      const plaintextBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.base64ToBuffer(backup.iv) },
        kek,
        this.base64ToBuffer(backup.ciphertext)
      );

      const { publicKeyJwk, privateKeyJwk } = JSON.parse(new TextDecoder().decode(plaintextBuffer)) as {
        publicKeyJwk: JsonWebKey;
        privateKeyJwk: JsonWebKey;
      };

      await this.putStoredKeyPair({ userId, publicKeyJwk, privateKeyJwk });
      this.privateKeyCache.delete(userId);
      this.ownPublicKeyCache.delete(userId);

      return true;
    } catch {
      // Wrong password (or corrupted/incompatible backup) - AES-GCM auth
      // tag verification failing is the expected, safe way this shows up.
      return false;
    }
  }

  private hexToBuffer(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  private async getPrivateKey(userId: string): Promise<CryptoKey> {
    const cached = this.privateKeyCache.get(userId);
    if (cached) return cached;

    const stored = await this.getStoredKeyPair(userId);
    if (!stored) {
      throw new Error('No local encryption key found for this user on this device');
    }

    const key = await crypto.subtle.importKey('jwk', stored.privateKeyJwk, RSA_ALGO, true, ['decrypt']);
    this.privateKeyCache.set(userId, key);
    return key;
  }

  private async getOwnPublicKey(userId: string): Promise<CryptoKey> {
    const cached = this.ownPublicKeyCache.get(userId);
    if (cached) return cached;

    const stored = await this.getStoredKeyPair(userId);
    if (!stored) {
      throw new Error('No local encryption key found for this user on this device');
    }

    const key = await crypto.subtle.importKey('jwk', stored.publicKeyJwk, RSA_ALGO, true, ['encrypt']);
    this.ownPublicKeyCache.set(userId, key);
    return key;
  }

  private async importOtherPublicKey(publicKeyJwkString: string): Promise<CryptoKey> {
    const cached = this.otherPublicKeyCache.get(publicKeyJwkString);
    if (cached) return cached;

    const jwk = JSON.parse(publicKeyJwkString) as JsonWebKey;
    const key = await crypto.subtle.importKey('jwk', jwk, RSA_ALGO, true, ['encrypt']);
    this.otherPublicKeyCache.set(publicKeyJwkString, key);
    return key;
  }

  // ---------- encrypt / decrypt ----------

  /**
   * Encrypts `plaintext` for a conversation between `senderUserId` (the
   * caller, whose key pair must already exist locally) and a recipient
   * identified only by their public key JWK string.
   */
  async encryptMessage(
    plaintext: string,
    senderUserId: string,
    recipientPublicKeyJwkString: string
  ): Promise<EncryptedPayload> {
    const [ownPublicKey, recipientPublicKey] = await Promise.all([
      this.getOwnPublicKey(senderUserId),
      this.importOtherPublicKey(recipientPublicKeyJwkString)
    ]);

    const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt'
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encoded = new TextEncoder().encode(plaintext);
    const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);

    const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);

    const [encryptedKeyForSender, encryptedKeyForReceiver] = await Promise.all([
      crypto.subtle.encrypt({ name: 'RSA-OAEP' }, ownPublicKey, rawAesKey),
      crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recipientPublicKey, rawAesKey)
    ]);

    return {
      ciphertext: this.bufferToBase64(ciphertextBuffer),
      iv: this.bufferToBase64(iv.buffer),
      encryptedKeyForSender: this.bufferToBase64(encryptedKeyForSender),
      encryptedKeyForReceiver: this.bufferToBase64(encryptedKeyForReceiver)
    };
  }

  /**
   * Decrypts a message for `viewerUserId`, using `encryptedKeyForSender` if
   * the viewer sent it or `encryptedKeyForReceiver` if the viewer received
   * it. Returns null (rather than throwing) if decryption isn't possible -
   * e.g. the message was encrypted for a key pair this device doesn't have.
   */
  async decryptMessage(
    viewerUserId: string,
    isViewerTheSender: boolean,
    payload: { ciphertext: string; iv: string; encryptedKeyForSender: string; encryptedKeyForReceiver: string }
  ): Promise<string | null> {
    try {
      const privateKey = await this.getPrivateKey(viewerUserId);
      const wrappedKey = isViewerTheSender ? payload.encryptedKeyForSender : payload.encryptedKeyForReceiver;

      const rawAesKey = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        this.base64ToBuffer(wrappedKey)
      );

      const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM' }, false, ['decrypt']);

      const plaintextBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.base64ToBuffer(payload.iv) },
        aesKey,
        this.base64ToBuffer(payload.ciphertext)
      );

      return new TextDecoder().decode(plaintextBuffer);
    } catch {
      return null;
    }
  }

  // ---------- base64 helpers ----------

  private bufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
