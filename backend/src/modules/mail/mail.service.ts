import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('MAIL_HOST');
    this.from = this.config.get<string>('MAIL_FROM', 'no-reply@sistemalia.local');
    const user = this.config.get<string>('MAIL_USER');

    // No SMTP host configured (e.g. local dev) -> fall back to logging the
    // email instead of sending a real one, so auth flows can be exercised
    // end-to-end without a mail provider.
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: this.config.get<number>('MAIL_PORT', 587),
          secure: this.config.get<string>('MAIL_SECURE') === 'true',
          auth: user ? { user, pass: this.config.get<string>('MAIL_PASSWORD') } : undefined,
        })
      : null;
  }

  async sendOtpEmail(to: string, code: string): Promise<void> {
    await this.send(
      to,
      'Tu código de verificación - Sistema LIA',
      `Tu código de verificación es: ${code}. Expira en 15 minutos.`,
    );
  }

  async sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
    await this.send(
      to,
      'Restablece tu contraseña - Sistema LIA',
      `Solicitaste restablecer tu contraseña. Usa este enlace (expira en 1 hora): ${resetUrl}`,
    );
  }

  async sendGoogleAccountNotice(to: string): Promise<void> {
    await this.send(
      to,
      'Tu cuenta usa inicio de sesión con Google - Sistema LIA',
      'Tu cuenta está vinculada a Google. Inicia sesión con el botón "Continuar con Google" — no tienes una contraseña local que restablecer.',
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`MAIL_HOST no configurado (modo mock). [${subject}] -> ${to}: ${text}`);
      return;
    }

    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }
}
