import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as dns } from 'dns';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type OtpPurpose = 'verify' | 'reset';

/** Duree de vie de l'IP resolue : les serveurs SMTP de Gmail tournent. */
const IP_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  private host: string;
  private port: number;
  private user: string;
  private pass: string;
  private fromAddress: string;

  private transporter: nodemailer.Transporter | null = null;
  private resolvedAt = 0;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.host = this.config.get<string>('MAIL_HOST');
    this.port = Number(this.config.get<string>('MAIL_PORT') ?? 587);
    this.user = this.config.get<string>('MAIL_USER');
    this.pass = this.config.get<string>('MAIL_PASS');
    this.fromAddress = `TeamPulse <${this.user}>`;
  }

  /**
   * Railway ne route pas l'IPv6 vers l'internet public, et smtp.gmail.com
   * publie un AAAA. Nodemailer resout lui-meme le nom puis tire une adresse
   * *au hasard* parmi celles trouvees (shared/index.js, formatDNSValue) ; il
   * n'inclut l'IPv4 que s'il detecte une interface IPv4 non interne, ce que le
   * conteneur n'a pas. Resultat : ENETUNREACH systematique.
   *
   * On resout donc l'IPv4 ici et on passe l'adresse telle quelle. Ni
   * `family: 4` ni `allowInternalNetworkInterfaces` n'y changent quoi que ce
   * soit : le premier arrive trop tard, le second n'atteint pas la fonction
   * de resolution.
   */
  private async resolveIpv4(): Promise<string | null> {
    try {
      const [ip] = await dns.resolve4(this.host);
      return ip ?? null;
    } catch (err) {
      this.logger.warn(
        `Resolution IPv4 de ${this.host} impossible (${(err as Error).message}), repli sur le nom d'hote.`,
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
      // validation du certificat de Gmail echoue. Nodemailer fusionne les
      // options `tls` dans celles de la connexion, pour la liaison directe
      // comme pour STARTTLS.
      tls: { servername: this.host },
      // Defauts de nodemailer a deux minutes : une connexion bloquee
      // retiendrait la requete tout ce temps.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    };

    this.transporter?.close();
    this.transporter = nodemailer.createTransport(options);
    this.resolvedAt = Date.now();
    this.logger.log(`Transport SMTP vers ${this.host} via ${ip ?? 'nom d\'hote'}:${this.port}`);
    return this.transporter;
  }

  /**
   * Ouvre la connexion SMTP et s'authentifie, sans envoyer de message.
   * Expose par /api/health/mail : l'envoi reel etant en fire-and-forget, une
   * panne SMTP n'est autrement visible que dans les logs du conteneur.
   */
  async verify(): Promise<{ ok: boolean; error?: string; code?: string }> {
    try {
      await (await this.transport()).verify();
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
      await (await this.transport()).sendMail({
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
