import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as dns } from 'dns';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type OtpPurpose = 'verify' | 'reset';
export type MailProvider = 'brevo' | 'sendgrid' | 'smtp' | 'none';

/** Duree de vie de l'IP resolue : les serveurs SMTP de Gmail tournent. */
const IP_TTL_MS = 5 * 60 * 1000;
const HTTP_TIMEOUT_MS = 15_000;

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  private host: string;
  private port: number;
  private user: string;
  private pass: string;
  private fromEmail: string;
  private readonly fromName = 'TeamPulse';

  private brevoKey?: string;
  private sendgridKey?: string;

  private transporter: nodemailer.Transporter | null = null;
  private resolvedAt = 0;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.host = this.config.get<string>('MAIL_HOST');
    this.port = Number(this.config.get<string>('MAIL_PORT') ?? 587);
    this.user = this.config.get<string>('MAIL_USER');
    this.pass = this.config.get<string>('MAIL_PASS');
    this.brevoKey = this.config.get<string>('BREVO_API_KEY');
    this.sendgridKey = this.config.get<string>('SENDGRID_API_KEY');

    // L'expediteur doit etre une adresse verifiee chez le fournisseur.
    this.fromEmail = this.config.get<string>('MAIL_FROM') ?? this.user;

    this.logger.log(`Transport e-mail : ${this.provider()}`);
  }

  /**
   * Railway bloque le SMTP sortant : 587 et 465 partent tous deux en
   * ETIMEDOUT. Une API HTTPS est donc necessaire en production, le SMTP
   * restant utilisable en local. La premiere cle presente gagne.
   */
  provider(): MailProvider {
    if (this.brevoKey) return 'brevo';
    if (this.sendgridKey) return 'sendgrid';
    if (this.host && this.user && this.pass) return 'smtp';
    return 'none';
  }

  // --- SMTP (developpement local) -----------------------------------------

  /**
   * Nodemailer resout le nom lui-meme puis tire une adresse au hasard parmi
   * celles trouvees, et n'inclut l'IPv4 que s'il detecte une interface IPv4
   * non interne sur la machine. On resout donc l'IPv4 ici et on passe
   * l'adresse telle quelle.
   */
  private async resolveIpv4(): Promise<string | null> {
    try {
      const [ip] = await dns.resolve4(this.host);
      return ip ?? null;
    } catch (err) {
      this.logger.warn(
        `Resolution IPv4 de ${this.host} impossible (${(err as Error).message}), repli sur le nom.`,
      );
      return null;
    }
  }

  private async transport(): Promise<nodemailer.Transporter> {
    if (this.transporter && Date.now() - this.resolvedAt < IP_TTL_MS) {
      return this.transporter;
    }

    const ip = await this.resolveIpv4();
    const options: SMTPTransport.Options = {
      host: ip ?? this.host,
      port: this.port,
      secure: this.port === 465,
      auth: { user: this.user, pass: this.pass },
      // `host` est une IP : sans servername, nodemailer desactive le SNI et la
      // validation du certificat echoue. Les options `tls` sont fusionnees
      // dans celles de la connexion.
      tls: { servername: this.host },
      // Defauts de nodemailer a deux minutes.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    };

    this.transporter?.close();
    this.transporter = nodemailer.createTransport(options);
    this.resolvedAt = Date.now();
    return this.transporter;
  }

  // --- Fournisseurs HTTPS --------------------------------------------------

  private async request(
    url: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<void> {
    const res = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined
        ? headers
        : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Le corps porte le detail utile : expediteur non verifie, quota, etc.
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} ${detail}`.trim());
    }
  }

  private brevo(to: string, subject: string, html: string): Promise<void> {
    return this.request(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': this.brevoKey },
      {
        sender: { email: this.fromEmail, name: this.fromName },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
    );
  }

  private sendgrid(to: string, subject: string, html: string): Promise<void> {
    return this.request(
      'https://api.sendgrid.com/v3/mail/send',
      { Authorization: `Bearer ${this.sendgridKey}` },
      {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: this.fromEmail, name: this.fromName },
        subject,
        content: [{ type: 'text/html', value: html }],
      },
    );
  }

  private async smtp(to: string, subject: string, html: string): Promise<void> {
    await (await this.transport()).sendMail({
      from: `${this.fromName} <${this.fromEmail}>`,
      to,
      subject,
      html,
    });
  }

  private deliver(to: string, subject: string, html: string): Promise<void> {
    switch (this.provider()) {
      case 'brevo':
        return this.brevo(to, subject, html);
      case 'sendgrid':
        return this.sendgrid(to, subject, html);
      case 'smtp':
        return this.smtp(to, subject, html);
      default:
        return Promise.reject(
          new Error(
            'Aucun transport e-mail configure : definir BREVO_API_KEY, SENDGRID_API_KEY, ou les variables MAIL_*.',
          ),
        );
    }
  }

  // --- Diagnostic ----------------------------------------------------------

  /**
   * Verifie que le transport est joignable et les identifiants acceptes, sans
   * envoyer de message. Expose par /api/health/mail : l'envoi reel etant en
   * fire-and-forget, une panne n'est autrement visible que dans les logs.
   */
  async verify(): Promise<{
    ok: boolean;
    provider: MailProvider;
    from?: string;
    error?: string;
    code?: string;
  }> {
    const provider = this.provider();
    try {
      if (provider === 'brevo') {
        await this.request('https://api.brevo.com/v3/account', {
          'api-key': this.brevoKey,
        });
      } else if (provider === 'sendgrid') {
        await this.request('https://api.sendgrid.com/v3/scopes', {
          Authorization: `Bearer ${this.sendgridKey}`,
        });
      } else if (provider === 'smtp') {
        await (await this.transport()).verify();
      } else {
        throw new Error('Aucun transport e-mail configure.');
      }
      return { ok: true, provider, from: this.fromEmail };
    } catch (err) {
      const e = err as Error & { code?: string };
      return {
        ok: false,
        provider,
        from: this.fromEmail,
        error: e.message,
        code: e.code,
      };
    }
  }

  // --- Envoi ---------------------------------------------------------------

  async sendOtp(email: string, otp: string, purpose: OtpPurpose): Promise<void> {
    const subject =
      purpose === 'verify'
        ? 'Vérifiez votre adresse email - TeamPulse'
        : 'Réinitialisation de mot de passe - TeamPulse';

    const heading =
      purpose === 'verify'
        ? 'Vérification de votre compte'
        : 'Réinitialisation du mot de passe';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px">
        <h1 style="color:#22c55e;margin:0 0 8px">TeamPulse</h1>
        <h2 style="margin:0 0 24px;color:#fff">${heading}</h2>
        <p style="margin:0 0 16px">Voici votre code à 6 chiffres. Il expire dans 10 minutes.</p>
        <div style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#22c55e;text-align:center;padding:20px;background:#1e293b;border-radius:12px;margin:16px 0">${otp}</div>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:13px">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
      </div>
    `;

    try {
      await this.deliver(email, subject, html);
      this.logger.log(`OTP (${purpose}) envoyé à ${email} via ${this.provider()}`);
    } catch (err) {
      this.logger.error(`Échec envoi OTP à ${email}: ${(err as Error).message}`);
      throw err;
    }
  }
}
