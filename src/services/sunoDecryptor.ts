/**
 * Decrypts Suno's AES-CTR encrypted progressive audio stream using the official
 * Mango DRM rights protocol.
 */

function parseBase64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function computeCounter(iv: Uint8Array, blockOffset: number = 0): Uint8Array {
  const counter = new Uint8Array(16);
  counter.set(iv);
  if (blockOffset === 0) return counter;
  let val = BigInt(0);
  for (let i = 0; i < 16; i++) {
    val = (val << BigInt(8)) | BigInt(counter[i]);
  }
  val += BigInt(blockOffset);
  for (let i = 15; i >= 0; i--) {
    counter[i] = Number(val & BigInt(255));
    val >>= BigInt(8);
  }
  return counter;
}

export async function decryptSunoAudioBuffer(
  contentId: string,
  buffer: ArrayBuffer
): Promise<ArrayBuffer> {
  // 1. Check if already decrypted (MP4 container begins with 'ftyp' at offset 4)
  if (buffer.byteLength >= 8) {
    const view = new DataView(buffer);
    if (view.getUint32(4) === 0x66747970) {
      return buffer;
    }
  }

  // 2. Try server-side decryption proxy first (handles insecure contexts / LAN IP without WebCrypto)
  try {
    const serverRes = await fetch(`/api/suno-decrypt?contentId=${encodeURIComponent(contentId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer,
    });
    if (serverRes.ok) {
      const serverDecrypted = await serverRes.arrayBuffer();
      if (serverDecrypted.byteLength >= 8) {
        const view = new DataView(serverDecrypted);
        if (view.getUint32(4) === 0x66747970) {
          return serverDecrypted;
        }
      }
    }
  } catch {
    // Server proxy unavailable, fallback to client WebCrypto
  }

  // 3. Client-side WebCrypto Fallback
  const subtle = typeof window !== 'undefined' ? window.crypto?.subtle : undefined;
  if (!subtle) {
    throw new Error(
      'WebCrypto is not supported in this browser context (non-secure HTTP). Please access via http://localhost:3000 or HTTPS.'
    );
  }

  // 4. Fetch license from Suno rights server (or local proxy)
  let rights: { key: string; iv: string; glt: string };
  try {
    const rightsRes = await fetch('https://studio-api.prod.suno.com/api/mango/rights', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        content_params: {
          content_id: contentId,
          content_type: 'clip',
        },
      }),
    });

    if (!rightsRes.ok) {
      throw new Error(`License fetch returned status ${rightsRes.status}`);
    }
    rights = await rightsRes.json();
  } catch {
    // If direct fails (e.g. CORS), fetch through local proxy
    const proxyRightsUrl = `/api/suno-rights?contentId=${encodeURIComponent(contentId)}`;
    const proxyRes = await fetch(proxyRightsUrl);
    if (!proxyRes.ok) {
      throw new Error('Failed to obtain Suno playback license');
    }
    rights = await proxyRes.json();
  }

  // 5. Derive Guest Key from GLT (AES-GCM)
  const gltBytes = new TextEncoder().encode(rights.glt);
  const gltHash = await subtle.digest('SHA-256', gltBytes);
  const guestKey = await subtle.importKey(
    'raw',
    gltHash,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // 3. Decrypt Content Key (c.key) using AES-GCM
  const keyBytes = parseBase64ToUint8(rights.key);
  const decryptedKeyRaw = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: keyBytes.slice(0, 12),
      additionalData: new TextEncoder().encode(contentId),
    },
    guestKey,
    keyBytes.slice(12)
  );
  const ctrKey = await subtle.importKey(
    'raw',
    decryptedKeyRaw,
    { name: 'AES-CTR' },
    false,
    ['decrypt']
  );

  // 4. Decrypt IV (c.iv) using AES-GCM
  const ivBytes = parseBase64ToUint8(rights.iv);
  const decryptedIvRaw = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes.slice(0, 12),
      additionalData: new TextEncoder().encode(contentId),
    },
    guestKey,
    ivBytes.slice(12)
  );
  const iv = new Uint8Array(decryptedIvRaw);

  // 5. Decrypt full audio stream with AES-CTR
  const counter = computeCounter(iv, 0);
  const decryptedAudio = await subtle.decrypt(
    { name: 'AES-CTR', counter: counter as unknown as BufferSource, length: 128 },
    ctrKey,
    buffer
  );

  return decryptedAudio;
}
