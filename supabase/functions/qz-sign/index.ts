const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readPkcs8PrivateKey(encodedPem: string) {
  let pem: string;

  try {
    pem = new TextDecoder().decode(decodeBase64(encodedPem));
  } catch {
    throw new Error('QZ_PRIVATE_KEY_BASE64 no contiene un valor Base64 válido.');
  }

  if (pem.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    throw new Error('La clave está en formato PKCS#1. Debe convertirse a PKCS#8 (BEGIN PRIVATE KEY).');
  }

  if (!pem.includes('-----BEGIN PRIVATE KEY-----') || !pem.includes('-----END PRIVATE KEY-----')) {
    throw new Error('La clave privada no tiene el formato PEM PKCS#8 esperado.');
  }

  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  try {
    return decodeBase64(body);
  } catch {
    throw new Error('El contenido interno de la clave privada no es Base64 válido.');
  }
}

function encodeBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido.' }, 405);
  }

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return jsonResponse({ error: 'El contenido debe enviarse como application/json.' }, 415);
    }

    const body: unknown = await request.json();
    const valueToSign = typeof body === 'object' && body !== null && 'request' in body
      ? (body as { request?: unknown }).request
      : undefined;

    if (typeof valueToSign !== 'string' || valueToSign.length === 0) {
      return jsonResponse({ error: 'El campo request es obligatorio y debe ser texto.' }, 400);
    }

    const encodedPrivateKey = Deno.env.get('QZ_PRIVATE_KEY_BASE64');
    if (!encodedPrivateKey) {
      throw new Error('El secreto QZ_PRIVATE_KEY_BASE64 no está configurado en Supabase.');
    }

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      readPkcs8PrivateKey(encodedPrivateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      new TextEncoder().encode(valueToSign),
    );

    return jsonResponse({ signature: encodeBase64(signature) });
  } catch (error) {
    console.error('No se pudo firmar la solicitud de QZ Tray:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Error desconocido al firmar.' },
      500,
    );
  }
});
