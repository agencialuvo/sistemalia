import { SocialChannel } from '@prisma/client';

/**
 * SocialChannel tal como viaja por la red — nunca `accessToken`/
 * `refreshToken` (spec §4: "Ningún token de acceso debe ser expuesto en las
 * respuestas JSON del Frontend"), aunque el registro en sí venga
 * desencriptado desde el service. `metadata` sí viaja completo: son datos de
 * visualización (foto de perfil, teléfono, permisos), no secretos.
 */
export type SerializedSocialChannel = Omit<SocialChannel, 'accessToken' | 'refreshToken'>;

export function serializeSocialChannel(channel: SocialChannel): SerializedSocialChannel {
  const { accessToken: _accessToken, refreshToken: _refreshToken, ...rest } = channel;
  return rest;
}
