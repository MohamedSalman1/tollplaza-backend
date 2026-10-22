import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database.module';
import { AuthModule } from './auth/auth.module';
import { IngestModule } from './ingest/ingest.module';
import { PlazasModule } from './plazas/plazas.module';
import { CrossingsModule } from './crossings/crossings.module';
import { AlertsModule } from './alerts/alerts.module';
import { ReferenceModule } from './reference/reference.module';
import { ReportsModule } from './reports/reports.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { LanesModule } from './lanes/lanes.module';
import { StreamModule } from './stream/stream.module';
import { IngestEventsModule } from './stream/ingest-events.module';
import { EntitiesModule } from '@app/entities/entities.module';
import { GlobalLogsInterceptor } from '@app/entities/interceptors/app-logs.interceptors';
import { GlobalCatchExceptionFilter } from '@app/entities/filters/global-exception.filter';
import { JwtTokenValidationMiddleware } from '@app/entities/middlewares/auth.middleware';
import { PublicApisMiddleware } from '@app/entities/middlewares/public-apis.middleware';
import { StaticApiKeyMiddleware } from '@app/entities/middlewares/static-api-key.middleware';

const loadYaml = () => {
  if (!process.env.NODE_ENV) {
    throw new Error(
      'NODE_ENV is not set. Set it in .env to the config file name, e.g. NODE_ENV=tollplaza.local for config/tollplaza.local.yaml',
    );
  }
  const path = `config/${process.env.NODE_ENV}.yaml`;
  return yaml.load(fs.readFileSync(path, 'utf8')) as Record<string, any>;
};

const V1 = '1';
const PUBLIC_ROUTES = [
  { path: 'auth/login', method: RequestMethod.POST, version: V1 },
];
// Machine-to-machine routes, authenticated with x-api-key instead of a JWT
const API_KEY_ROUTES = [
  { path: 'ingest/crossings', method: RequestMethod.POST, version: V1 },
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [loadYaml],
      expandVariables: true,
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('jwt.expires_in', '12h'),
        },
      }),
    }),
    DatabaseModule,
    EntitiesModule,
    IngestEventsModule,
    AuthModule,
    IngestModule,
    PlazasModule,
    CrossingsModule,
    AlertsModule,
    ReferenceModule,
    ReportsModule,
    WatchlistModule,
    LanesModule,
    StreamModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: GlobalLogsInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalCatchExceptionFilter,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtTokenValidationMiddleware)
      .exclude(...PUBLIC_ROUTES, ...API_KEY_ROUTES)
      .forRoutes('/');

    consumer.apply(PublicApisMiddleware).forRoutes(...PUBLIC_ROUTES);

    consumer
      .apply(PublicApisMiddleware, StaticApiKeyMiddleware)
      .forRoutes(...API_KEY_ROUTES);
  }
}
