// @ts-ignore
import argon2 from 'argon2-browser/dist/argon2-bundled.min.js';

// Converte string hexadecimal para Uint8Array
export function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Converte bytes para string hexadecimal
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Algoritmo RC4 para criptografia/descriptografia de fallback
function rc4Init(key: Uint8Array) {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    s[i] = i;
  }
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) % 256;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
  }
  return s;
}

function rc4Crypt(key: Uint8Array, input: Uint8Array): Uint8Array {
  const s = rc4Init(key);
  const output = new Uint8Array(input.length);
  let i = 0;
  let j = 0;
  for (let k = 0; k < input.length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
    const t = (s[i] + s[j]) % 256;
    output[k] = input[k] ^ s[t];
  }
  return output;
}

export type AppCryptoKey = CryptoKey | { type: 'fallback'; hash: Uint8Array };

// Deriva a chave AES-256 a partir das credenciais do usuário usando Argon2id
export async function deriveKey(
  nif: string,
  password: string,
  saltHex: string
): Promise<AppCryptoKey> {
  const salt = hexToBytes(saltHex);
  const result = await argon2.hash({
    pass: `${nif}:${password}`,
    salt: salt,
    type: argon2.ArgonType.Argon2id,
    mem: 65536,       // 64MB
    time: 3,          // 3 iterações
    parallelism: 4,   // 4 threads
    hashLen: 32,      // 256 bits para chave AES
  });

  // Salvar a chave derivada no sessionStorage para restaurar em caso de recarregamento
  try {
    sessionStorage.setItem('drcae_session_key', bytesToHex(result.hash));
  } catch (e) {
    console.error('Falha ao gravar drcae_session_key no sessionStorage:', e);
  }

  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Contexto inseguro - retornar fallback contendo o hash
    return { type: 'fallback', hash: result.hash };
  }

  return crypto.subtle.importKey(
    'raw',
    result.hash,
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false para segurança na memória JS
    ['encrypt', 'decrypt']
  );
}

// Encripta um objeto JS usando AES-256-GCM (ou RC4 em caso de fallback)
export async function encryptRecord(data: any, key: AppCryptoKey): Promise<string> {
  const iv = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(iv);
  } else {
    for (let i = 0; i < 12; i++) {
      iv[i] = Math.floor(Math.random() * 256);
    }
  }

  const encoded = new TextEncoder().encode(JSON.stringify(data));
  
  if (key && 'type' in key && key.type === 'fallback') {
    // Usar RC4 fallback
    // Derivar chave específica concatenando o hash base e o IV
    const rc4Key = new Uint8Array(key.hash.length + iv.length);
    rc4Key.set(key.hash);
    rc4Key.set(iv, key.hash.length);

    const ciphertext = rc4Crypt(rc4Key, encoded);

    // Combinar IV + ciphertext
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv);
    combined.set(ciphertext, iv.byteLength);

    // Adicionar um prefixo identificador "rc4:" ao base64 para saber que foi encriptado com fallback
    return 'rc4:' + btoa(String.fromCharCode(...combined));
  }

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key as CryptoKey,
    encoded
  );

  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return btoa(String.fromCharCode(...combined));
}

// Desencripta e analisa a string base64 de volta para o objeto original
export async function decryptRecord(cipher: string, key: AppCryptoKey): Promise<any> {
  const isFallbackEncrypted = cipher.startsWith('rc4:');
  const cleanCipher = isFallbackEncrypted ? cipher.substring(4) : cipher;

  const combined = Uint8Array.from(atob(cleanCipher), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  if (isFallbackEncrypted || (key && 'type' in key && key.type === 'fallback')) {
    // Se foi encriptado com fallback ou a chave é fallback, usar RC4
    const rawHash = (key && 'type' in key && key.type === 'fallback') 
      ? key.hash 
      : await (async () => {
          throw new Error('Chave nativa não suporta decodificação de registro fallback.');
        })();

    const rc4Key = new Uint8Array(rawHash.length + iv.length);
    rc4Key.set(rawHash);
    rc4Key.set(iv, rawHash.length);

    const plaintext = rc4Crypt(rc4Key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key as CryptoKey,
    ciphertext
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}

// Chave em memória ativa durante a sessão do aplicativo
let activeKey: AppCryptoKey | null = null;

export function setActiveKey(key: AppCryptoKey | null) {
  activeKey = key;
  if (key === null) {
    sessionStorage.removeItem('drcae_session_key');
  }
}

export function getActiveKey(): AppCryptoKey | null {
  return activeKey;
}

// Deriva uma assinatura local irreversível baseada em NIF + Senha + device_id.
// Independente do salt do servidor — funciona 100% offline.
// Usada para verificar credenciais offline sem expor a chave AES.
export async function deriveLocalSignature(
  nif: string,
  password: string,
  deviceId: string
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(nif + ':' + password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode(deviceId + ':' + nif),
      iterations: 600000,
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function restoreSessionKey(hex: string): Promise<AppCryptoKey> {
  const bytes = hexToBytes(hex);
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    activeKey = { type: 'fallback', hash: bytes };
    return activeKey;
  }
  activeKey = await crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return activeKey;
}

