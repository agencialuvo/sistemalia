import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12; // Longitud recomendada para GCM (NIST SP 800-38D).

/**
 * Encripta/desencripta secretos en reposo (Feature 09, spec §3.1) — hoy los
 * tokens OAuth2 de Google Calendar en `Tenant.googleAccessToken`/
 * `googleRefreshToken`, pero deliberadamente genérico: cualquier otro
 * secreto que el sistema necesite guardar a futuro (credenciales de un
 * proveedor de pagos, etc.) puede reusar este servicio en vez de que cada
 * módulo reinvente su propio cifrado.
 *
 * AES-256-GCM porque es AUTENTICADO: a diferencia de AES-CBC, un ciphertext
 * manipulado falla al desencriptar en vez de devolver basura silenciosa —
 * importante para un valor que luego se usa para llamar a una API externa
 * con privilegios de escritura.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const configuredKey = config.get<string>('GOOGLE_TOKEN_ENCRYPTION_KEY');

    if (configuredKey) {
      const key = Buffer.from(configuredKey, 'hex');
      if (key.length !== KEY_LENGTH_BYTES) {
        throw new Error(
          `GOOGLE_TOKEN_ENCRYPTION_KEY debe ser un hex de ${KEY_LENGTH_BYTES * 2} caracteres (${KEY_LENGTH_BYTES} bytes) — tiene ${key.length} bytes.`,
        );
      }
      this.key = key;
      return;
    }

    if (config.get<string>('NODE_ENV') === 'production') {
      // A diferencia de MAIL_HOST/RECAPTCHA_SECRET_KEY (que degradan a un
      // modo mock en desarrollo), este secreto no puede caer a un valor
      // fijo en producción: un token de Google guardado con una clave
      // adivinable es un incidente de seguridad, no un feature a medias.
      throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY es obligatorio en producción.');
    }

    // Desarrollo sin la variable configurada: deriva una clave fija y
    // avisa fuerte, en vez de tumbar el arranque — mismo criterio que
    // JWT_SECRET's "change-me-in-production" default.
    this.logger.warn(
      'GOOGLE_TOKEN_ENCRYPTION_KEY no configurado — usando una clave de desarrollo fija. ' +
        'NO uses esto en producción: cualquier token guardado con esta clave debe considerarse comprometido.',
    );
    this.key = createHash('sha256').update('lia-google-calendar-dev-only-encryption-key').digest();
  }

  /** `iv:authTag:ciphertext`, todo hex — auto-contenido, no depende de una
   *  tabla de IVs aparte. */
  encrypt(plainText: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
  }

  decrypt(cipherText: string): string {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException('El valor encriptado tiene un formato inválido.');
    }
    const [ivHex, authTagHex, ciphertextHex] = parts;

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    try {
      const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
      return plaintext.toString('utf8');
    } catch {
      // setAuthTag hace que `final()` falle si el ciphertext fue manipulado
      // o se desencripta con la clave equivocada — nunca debe devolver
      // basura silenciosa para un token que luego se usa contra Google.
      throw new InternalServerErrorException('No se pudo desencriptar el valor — pudo haber sido manipulado.');
    }
  }
}
