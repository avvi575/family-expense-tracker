import { Injectable, Logger } from '@nestjs/common';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { join } from 'path';
import * as nodemailer from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface TextMessage {
  to: string;
  body: string;
}

export interface DeliveryResult {
  channel: 'smtp' | 'webhook' | 'outbox' | 'skipped';
  reason?: string;
}

/**
 * Delivers email/SMS/WhatsApp.
 *
 * - Email: real SMTP when SMTP_URL is set. Failures are caught, logged, and
 *   the message is written to backend/outbox/ so nothing is silently lost.
 *   sendEmail() also returns a structured result so callers can surface the
 *   outcome to the user (e.g. "sent", "queued (outbox)", "failed").
 * - SMS/WhatsApp: POST to SMS_WEBHOOK_URL / WHATSAPP_WEBHOOK_URL when set;
 *   otherwise written to backend/outbox/.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly outboxDir = join(process.cwd(), 'outbox');
  private readonly smtpUrl = (process.env.SMTP_URL || '').trim();
  private readonly mailFrom = process.env.MAIL_FROM || 'Family Expense Tracker <no-reply@family-expenses.local>';
  private readonly smsWebhook = (process.env.SMS_WEBHOOK_URL || '').trim();
  private readonly whatsappWebhook = (process.env.WHATSAPP_WEBHOOK_URL || '').trim();
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (this.smtpUrl) {
      try {
        this.transporter = nodemailer.createTransport(this.smtpUrl);
        this.logger.log(`Email delivery via SMTP (${this.smtpUrl.replace(/\/\/.*@/, '//***@')}`);
      } catch (e) {
        this.logger.error(`Failed to create SMTP transporter: ${errMessage(e)}`);
        this.transporter = null;
      }
    } else {
      this.logger.warn('SMTP_URL not set — email delivery will use outbox files');
    }
  }

  /**
   * Returns a structured result so callers can show the user what happened.
   */
  async sendEmail(msg: EmailMessage): Promise<DeliveryResult> {
    if (!msg.to) {
      return { channel: 'skipped', reason: 'no recipient' };
    }

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.mailFrom,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
        });
        this.logger.log(`Email sent to ${msg.to} via SMTP`);
        return { channel: 'smtp' };
      } catch (err) {
        const reason = errMessage(err);
        this.logger.error(`SMTP send failed to ${msg.to}: ${reason}. Falling back to outbox.`);
        this.writeOutbox('email', `To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n`);
        return { channel: 'outbox', reason: `smtp failed: ${reason}` };
      }
    }

    this.writeOutbox('email', `To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n`);
    return { channel: 'outbox', reason: this.smtpUrl ? 'smtp disabled after init failure' : 'no smtp_url configured' };
  }

  async sendSms(msg: TextMessage): Promise<DeliveryResult> {
    if (!msg.to) return { channel: 'skipped', reason: 'no recipient' };
    if (this.smsWebhook) {
      try {
        await this.postWebhook(this.smsWebhook, { phone: msg.to, body: msg.body });
        return { channel: 'webhook' };
      } catch (err) {
        const reason = errMessage(err);
        this.logger.error(`SMS webhook failed: ${reason}. Falling back to outbox.`);
        this.writeOutbox('sms', `SMS to ${msg.to}:\n${msg.body}\n`);
        return { channel: 'outbox', reason: `webhook failed: ${reason}` };
      }
    }
    this.writeOutbox('sms', `SMS to ${msg.to}:\n${msg.body}\n`);
    return { channel: 'outbox', reason: 'no sms_webhook configured' };
  }

  async sendWhatsapp(msg: TextMessage): Promise<DeliveryResult> {
    if (!msg.to) return { channel: 'skipped', reason: 'no recipient' };
    if (this.whatsappWebhook) {
      try {
        await this.postWebhook(this.whatsappWebhook, { phone: msg.to, body: msg.body });
        return { channel: 'webhook' };
      } catch (err) {
        const reason = errMessage(err);
        this.logger.error(`WhatsApp webhook failed: ${reason}. Falling back to outbox.`);
        this.writeOutbox('whatsapp', `WhatsApp to ${msg.to}:\n${msg.body}\n`);
        return { channel: 'outbox', reason: `webhook failed: ${reason}` };
      }
    }
    this.writeOutbox('whatsapp', `WhatsApp to ${msg.to}:\n${msg.body}\n`);
    return { channel: 'outbox', reason: 'no whatsapp_webhook configured' };
  }

  /**
   * List recent outbox files (for debugging / health checks).
   */
  listOutbox(limit = 20) {
    if (!existsSync(this.outboxDir)) return [];
    const entries = readdirSync(this.outboxDir, { withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => {
        const s = statSync(join(this.outboxDir, f.name));
        return { name: f.name, size: s.size, mtimeMs: s.mtimeMs, mtime: s.mtime };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return entries.slice(0, limit).map((f) => ({
      name: f.name,
      size: f.size,
      updatedAt: f.mtime.toISOString(),
      kind: f.name.endsWith('-email.txt')
        ? 'email'
        : f.name.endsWith('-sms.txt')
          ? 'sms'
          : f.name.endsWith('-whatsapp.txt')
            ? 'whatsapp'
            : 'unknown',
    }));
  }

  /**
   * Read the contents of a specific outbox file by name.
   */
  readOutbox(fileName: string): string | null {
    const path = join(this.outboxDir, fileName);
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8');
  }

  /**
   * Verify SMTP connectivity by opening a test connection (no email sent).
   * Returns a structured health check result.
   */
  async verifySmtp(): Promise<{ ok: boolean; reason?: string }> {
    if (!this.transporter) {
      return { ok: false, reason: 'SMTP_URL not configured' };
    }
    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: errMessage(err) };
    }
  }

  private writeOutbox(kind: string, content: string) {
    mkdirSync(this.outboxDir, { recursive: true });
    const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${kind}.txt`;
    appendFileSync(join(this.outboxDir, stamp), content, 'utf8');
    this.logger.log(`${kind} delivery -> outbox/${stamp}`);
  }

  private postWebhook(url: string, payload: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const reqFn = url.startsWith('https') ? httpsRequest : httpRequest;
      const req = reqFn(
        url,
        { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } },
        (res) => {
          res.resume();
          res.on('end', () => resolve());
        },
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}
