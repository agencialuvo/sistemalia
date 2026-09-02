import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

/** `ConfigService` mínimo — solo `get()`, único método que
 *  EncryptionService llama. */
function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('EncryptionService', () => {
  const validKey = 'a'.repeat(64); // 32 bytes en hex.

  it('desencripta exactamente lo que encriptó (round-trip transparente)', () => {
    const service = new EncryptionService(fakeConfig({ GOOGLE_TOKEN_ENCRYPTION_KEY: validKey }));

    const plainText = 'ya29.a0AfH6SMC-token-secreto-de-ejemplo';
    const cipherText = service.encrypt(plainText);

    expect(cipherText).not.toBe(plainText);
    expect(service.decrypt(cipherText)).toBe(plainText);
  });

  it('produce un ciphertext distinto en cada llamada (IV aleatorio por mensaje)', () => {
    const service = new EncryptionService(fakeConfig({ GOOGLE_TOKEN_ENCRYPTION_KEY: validKey }));

    const first = service.encrypt('mismo-texto');
    const second = service.encrypt('mismo-texto');

    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe('mismo-texto');
    expect(service.decrypt(second)).toBe('mismo-texto');
  });

  it('rechaza un ciphertext manipulado en vez de devolver basura silenciosa', () => {
    const service = new EncryptionService(fakeConfig({ GOOGLE_TOKEN_ENCRYPTION_KEY: validKey }));

    const cipherText = service.encrypt('token-original');
    const [iv, authTag, ciphertext] = cipherText.split(':');
    // Voltea el último caracter del ciphertext — mismo largo, contenido roto.
    const lastChar = ciphertext[ciphertext.length - 1];
    const tamperedHex = ciphertext.slice(0, -1) + (lastChar === '0' ? '1' : '0');
    const tampered = `${iv}:${authTag}:${tamperedHex}`;

    expect(() => service.decrypt(tampered)).toThrow(InternalServerErrorException);
  });

  it('rechaza un valor con formato inválido (no tiene las 3 partes esperadas)', () => {
    const service = new EncryptionService(fakeConfig({ GOOGLE_TOKEN_ENCRYPTION_KEY: validKey }));

    expect(() => service.decrypt('no-es-un-ciphertext-valido')).toThrow(InternalServerErrorException);
  });

  it('cae a una clave de desarrollo fija cuando falta la variable de entorno fuera de producción', () => {
    const service = new EncryptionService(fakeConfig({ NODE_ENV: 'test' }));

    const cipherText = service.encrypt('token-en-dev');
    expect(service.decrypt(cipherText)).toBe('token-en-dev');
  });

  it('falla rápido en producción si falta la variable de entorno', () => {
    expect(() => new EncryptionService(fakeConfig({ NODE_ENV: 'production' }))).toThrow(
      'GOOGLE_TOKEN_ENCRYPTION_KEY es obligatorio en producción.',
    );
  });

  it('rechaza una clave configurada con un largo distinto a 32 bytes', () => {
    expect(() => new EncryptionService(fakeConfig({ GOOGLE_TOKEN_ENCRYPTION_KEY: 'deadbeef' }))).toThrow(
      /debe ser un hex de 64 caracteres/,
    );
  });
});
