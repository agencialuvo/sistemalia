import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './services/encryption.service';

/**
 * `@Global()` porque `EncryptionService` ya dejó de tener un único
 * consumidor — GoogleCalendarModule (Feature 09) y SocialChannelsModule
 * (Feature 10) ambos cifran secretos en reposo con el mismo servicio. Es el
 * punto de promoción que el propio doc comment de GoogleCalendarModule
 * anticipaba ("si otro módulo llega a necesitar cifrar secretos, ese es el
 * momento de promoverlo a un CommonModule @Global()").
 */
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class CommonModule {}
