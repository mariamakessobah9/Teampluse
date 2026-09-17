import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export type OtpPurpose = 'verify' | 'reset';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private fromAddress: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('MAIL_HOST');
    const port = this.config.get<number>('MAIL_PORT', 587);
    const user = this.config.get<string>('MAIL_USER');
    const pass = this.config.get<string>('MAIL_PASS');

    this.fromAddress = `TeamPulse <${user}>`;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  /**
   * Ouvre la connexion SMTP et s'authentifie, sans envoyer de message.
   * Expose par /api/health/mail : l'envoi reel etant en fire-and-forget, une
   * panne SMTP n'est autrement visible que dans les logs du conteneur.
   */
  async verify(): Promise<{ ok: boolean; error?: string; code?: string }> {
    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (err) {
      const e = err as Error & { code?: string };
      return { ok: false, error: e.message, code: e.code };
    }
  }

  async sendOtp(email: string, otp: string, purpose: OtpPurpose): Promise<void> {
    const subject =
      purpose === 'verify'
        ? 'Vérifiez votre adresse email - TeamPulse'
        : 'Réinitialisation de mot de passe - TeamPulse';

    const heading =
      purpose === 'verify' ? 'Vérification de votre compte' : 'Réinitialisation du mot de passe';

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
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: email,
        subject,
        html,
      });
      this.logger.log(`OTP (${purpose}) envoyé à ${email}`);
    } catch (err) {
      this.logger.error(`Échec envoi OTP à ${email}: ${(err as Error).message}`);
      throw err;
    }
  }
}
