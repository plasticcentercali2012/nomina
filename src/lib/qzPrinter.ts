import * as qz from 'qz-tray';
import { supabase } from './supabaseClient';

const PRINTER_STORAGE_KEY = 'nomina:qz-printer';
const ESC = '\x1B';
const GS = '\x1D';
let qzSecurityConfigured = false;

function configureQzSecurity() {
  if (qzSecurityConfigured) return;

  qz.security.setCertificatePromise((resolve, reject) => {
    const certificateUrl = `${import.meta.env.BASE_URL}qz/digital-certificate.txt`;

    fetch(certificateUrl, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`No se pudo cargar el certificado QZ (${response.status}).`);
        }

        const certificate = await response.text();
        if (!certificate.includes('-----BEGIN CERTIFICATE-----')) {
          throw new Error('El archivo digital-certificate.txt no contiene un certificado válido.');
        }

        resolve(certificate);
      })
      .catch(reject);
  });

  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise(async (requestToSign) => {
    const { data, error } = await supabase.functions.invoke('qz-sign', {
      body: { request: requestToSign }
    });

    if (error) {
      throw new Error(`La función qz-sign rechazó la solicitud: ${error.message}`);
    }

    if (!data || typeof data.signature !== 'string' || !data.signature) {
      const detail = data && typeof data.error === 'string' ? ` ${data.error}` : '';
      throw new Error(`La función qz-sign no devolvió una firma válida.${detail}`);
    }

    return data.signature;
  });

  qzSecurityConfigured = true;
}

export function getSavedPrinter() {
  return window.localStorage.getItem(PRINTER_STORAGE_KEY) ?? '';
}

export function saveQzPrinter(printer: string) {
  window.localStorage.setItem(PRINTER_STORAGE_KEY, printer);
}

async function ensureConnected() {
  configureQzSecurity();
  if (qz.websocket.isActive()) return;
  try {
    await qz.websocket.connect({ retries: 3, delay: 1 });
  } catch {
    throw new Error('No se pudo conectar con QZ Tray. Verifica que esté instalado y abierto.');
  }
}

export async function getQzPrinters() {
  await ensureConnected();
  const result = await qz.printers.find();
  const printers = Array.isArray(result) ? result : [result];
  if (!printers.length) throw new Error('QZ Tray no encontró impresoras instaladas.');

  const defaultPrinter = await qz.printers.getDefault().catch(() => printers[0]);
  return { printers, defaultPrinter };
}

async function resolvePrinter() {
  await ensureConnected();
  const saved = getSavedPrinter();
  if (saved) {
    try {
      const found = await qz.printers.find(saved);
      if (typeof found === 'string') return found;
      if (found.includes(saved)) return saved;
    } catch {
      window.localStorage.removeItem(PRINTER_STORAGE_KEY);
    }
  }
  const printer = await qz.printers.getDefault();
  window.localStorage.setItem(PRINTER_STORAGE_KEY, printer);
  return printer;
}

export async function printEscPos(rawData: string, jobName: string) {
  const printer = await resolvePrinter();
  const config = qz.configs.create(printer, {
    encoding: 'CP850',
    jobName,
    copies: 1
  });
  await qz.print(config, [rawData]);
  return printer;
}

function safeText(value: string) {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/×/g, 'x')
    .trim();
}

export function fitColumns(left: string, right: string, width = 32) {
  const safeLeft = safeText(left);
  const safeRight = safeText(right);
  const maxLeft = Math.max(1, width - safeRight.length - 1);
  const clippedLeft = safeLeft.slice(0, maxLeft);
  return `${clippedLeft}${' '.repeat(Math.max(1, width - clippedLeft.length - safeRight.length))}${safeRight.slice(-width)}`;
}

export function wrapReceiptText(value: string, width = 32) {
  const words = safeText(value).split(/\s+/);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    if (!current) {
      current = word.slice(0, width);
    } else if (`${current} ${word}`.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word.slice(0, width);
    }
  });
  if (current) lines.push(current);
  return lines;
}

export class EscPosReceipt {
  private chunks: string[] = [`${ESC}@`, `${ESC}t\x02`, `${ESC}M\x00`, `${ESC}!\x00`];

  align(value: 0 | 1 | 2) { this.chunks.push(`${ESC}a${String.fromCharCode(value)}`); return this; }
  bold(enabled: boolean) { this.chunks.push(`${ESC}E${String.fromCharCode(enabled ? 1 : 0)}`); return this; }
  line(value = '') { this.chunks.push(`${safeText(value)}\n`); return this; }
  wrapped(value: string) { wrapReceiptText(value).forEach((line) => this.line(line)); return this; }
  separator(char = '-') { return this.line(char.repeat(32)); }
  feed(lines = 1) { this.chunks.push('\n'.repeat(lines)); return this; }
  finish() {
    this.align(0).bold(false).feed(4);
    this.chunks.push(`${GS}V${String.fromCharCode(66)}\x00`);
    return this.chunks.join('');
  }
}
