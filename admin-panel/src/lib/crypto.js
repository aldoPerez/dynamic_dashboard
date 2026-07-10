const ALGO = 'AES-GCM'

async function getKey() {
  const raw = import.meta.env.VITE_ENCRYPTION_KEY
  if (!raw) throw new Error('VITE_ENCRYPTION_KEY no definida')
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(raw.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
  )
}

export async function encrypt(plaintext) {
  const key = await getKey()
  const iv  = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: ALGO, iv }, key, new TextEncoder().encode(plaintext))
  const combined = new Uint8Array(iv.byteLength + cipher.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipher), iv.byteLength)
  return btoa(String.fromCharCode(...combined))
}

export async function decrypt(b64) {
  const key      = await getKey()
  const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const plain    = await crypto.subtle.decrypt({ name: ALGO, iv: combined.slice(0, 12) }, key, combined.slice(12))
  return new TextDecoder().decode(plain)
}
