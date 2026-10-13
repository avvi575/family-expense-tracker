import { PDFParse, PasswordException } from 'pdf-parse';
import { execFile } from 'child_process';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import { join } from 'path';
import { randomUUID } from 'crypto';
import Tesseract from 'tesseract.js';

const execFileAsync = promisify(execFile);

export interface PdfExtractResult {
  text: string;
  passwordRequired: boolean;
  passwordUsed?: string;
}

const MIN_TEXT_LENGTH = 200;
const OCR_PAGE_LIMIT = 10;

/** Extract text from a PDF, trying an optional password. If the PDF is
 *  password-protected and no password is given, returns { passwordRequired: true }.
 *  If qpdf is available, it is used to strip the password before parsing;
 *  otherwise pdf-parse's built-in password support is used.
 *  If the PDF appears to be scanned/image-based, falls back to OCR via a
 *  separate Node process to avoid pdf.js worker version conflicts.
 */
export async function extractPdfText(buffer: Uint8Array, password?: string): Promise<PdfExtractResult> {
  if (password) {
    const stripped = await tryDecryptWithQpdf(buffer, password);
    if (stripped) {
      const result = await parseBuffer(stripped);
      if (result.text.length < MIN_TEXT_LENGTH && looksScanned(result.text)) {
        return await extractWithOcr(stripped);
      }
      return result;
    }
  }
  try {
    const result = await parseBuffer(buffer, password);
    if (result.text.length < MIN_TEXT_LENGTH && looksScanned(result.text)) {
      return await extractWithOcr(buffer);
    }
    return result;
  } catch (e) {
    if (e instanceof PasswordException || (e as Error)?.message?.toLowerCase().includes('password')) {
      return { text: '', passwordRequired: true };
    }
    throw e;
  }
}

function looksScanned(text: string): boolean {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 20) return true;
  if (/^--\s*\d+\s+of\s*\d+\s*--$/gm.test(cleaned)) return true;
  const meaningful = cleaned.replace(/--\s*\d+\s+of\s*\d+\s*--/g, '').trim();
  return meaningful.length < 20;
}

async function parseBuffer(buffer: Uint8Array, password?: string): Promise<PdfExtractResult> {
  const parser = new PDFParse({ data: buffer, password } as any);
  try {
    const result = await parser.getText();
    return { text: result?.text ?? '', passwordRequired: false, passwordUsed: password };
  } finally {
    await parser.destroy();
  }
}

async function extractWithOcr(buffer: Uint8Array): Promise<PdfExtractResult> {
  const tempDir = join(process.env.TEMP ?? '.', `fet-ocr-${Date.now()}-${randomUUID()}`);
  const scriptPath = join(process.env.TEMP ?? '.', `fet-pdf-to-img-${Date.now()}.js`);

  try {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(
      scriptPath,
      `const { pdf } = require('pdf-to-img');
       const fs = require('fs');
       const path = require('path');
       (async () => {
         const inputPath = process.argv[2];
         const outputDir = process.argv[3];
         const scale = parseFloat(process.argv[4] || '2.0');
         const maxPages = parseInt(process.argv[5] || '10', 10);
         if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
         const buf = fs.readFileSync(inputPath);
         const doc = await pdf(buf, { scale });
         const count = Math.min(doc.length, maxPages);
         for (let i = 1; i <= count; i++) {
           const img = await doc.getPage(i);
           if (!Buffer.isBuffer(img)) continue;
           const out = path.join(outputDir, 'page-' + i + '.png');
           fs.writeFileSync(out, img);
           console.log(out);
         }
       })().catch((e) => { console.error(e.message); process.exit(1); });
      `.replace(/^\s+/gm, ''),
    );

    const inputPath = join(tempDir, 'input.pdf');
    writeFileSync(inputPath, buffer);

    const { stdout } = await execFileAsync(
      process.execPath,
      [scriptPath, inputPath, tempDir, '2.0', String(OCR_PAGE_LIMIT)],
      {
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, NODE_PATH: join(process.cwd(), 'node_modules') },
      },
    ).catch((e: any) => {
      console.error('Child process error:', e.message);
      throw e;
    });

    console.log('Child process stdout length:', stdout.length);
    console.log('Child process stdout:', JSON.stringify(stdout.substring(0, 200)));

    const imagePaths = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && existsSync(l));

    console.log('Image paths count:', imagePaths.length);
    if (imagePaths.length > 0) {
      console.log('First image path:', imagePaths[0]);
    }

    if (imagePaths.length === 0) {
      return { text: '', passwordRequired: false };
    }

    const pages: string[] = [];
    for (const imagePath of imagePaths.slice(0, OCR_PAGE_LIMIT)) {
      try {
        const { data: { text: ocrText } } = await Tesseract.recognize(imagePath, 'eng', {
          logger: () => {},
        });
        if (ocrText.trim()) pages.push(ocrText.trim());
      } catch (e: any) {
        console.error('OCR failed for', imagePath, e?.message ?? e);
      }
    }

    console.log('OCR pages:', pages.length, 'total chars:', pages.join('\n').length);
    return { text: pages.join('\n'), passwordRequired: false };
  } catch (e: any) {
    console.error('extractWithOcr error:', e?.message ?? e);
    return { text: '', passwordRequired: false };
  } finally {
    try { unlinkSync(scriptPath); } catch {}
    try { unlinkSync(tempDir); } catch {}
  }
}

/** Try to strip the password using qpdf CLI. Returns decrypted bytes or null. */
async function tryDecryptWithQpdf(buffer: Uint8Array, password: string): Promise<Uint8Array | null> {
  const qpdfPath = process.env.QPDF_PATH ?? 'qpdf';
  const tmpIn = join(process.env.TEMP ?? '.', `fet-pdf-in-${Date.now()}.pdf`);
  const tmpOut = join(process.env.TEMP ?? '.', `fet-pdf-out-${Date.now()}.pdf`);
  try {
    writeFileSync(tmpIn, buffer);
    await execFileAsync(qpdfPath, ['--password=' + password, '--decrypt', tmpIn, tmpOut]);
    if (!existsSync(tmpOut)) return null;
    const { readFileSync, unlinkSync } = require('fs');
    const out = new Uint8Array(readFileSync(tmpOut));
    try { unlinkSync(tmpIn); } catch {}
    try { unlinkSync(tmpOut); } catch {}
    return out;
  } catch {
    return null;
  }
}
