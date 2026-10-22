import { NestFactory } from '@nestjs/core';
import { VersioningType, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Ingest batches (up to 500 crossings) are larger than the 100kb default
  app.useBodyParser('json', { limit: '1mb' });

  // Behind a proxy, take the client IP from X-Forwarded-For
  app.set(
    'trust proxy',
    app.get(ConfigService).get<boolean>('http.trust_proxy', false),
  );

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.enableCors({
    // Authorization: the token on login. Content-Disposition: the filename of
    // CSV downloads (otherwise the browser can't read it).
    exposedHeaders: ['Authorization', 'Content-Disposition'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips unknown properties
      forbidNonWhitelisted: true, // throws error if unknown props exist
      transform: true, // auto-transforms types (e.g., string to number)
    }),
  );

  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
