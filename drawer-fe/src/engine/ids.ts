/**
 * 128-bit random id, base64url (22 characters), like the ids in spec section 4.
 * Uses crypto.getRandomValues, which also exists on plain http (for example a phone
 * testing the dev server on a LAN address), unlike crypto.randomUUID.
 */
export function newStrokeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
