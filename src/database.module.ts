import { Module, Logger } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import type { Dialect } from 'sequelize';
import { DB_CONNECTION } from '@app/entities/constants/constants';

const logger = new Logger('DatabaseModule');

/**
 * Shape of a `databases.<name>` block in config/<NODE_ENV>.yaml.
 */
type DatabaseConfig = {
  database: string;
  username: string;
  password: string;
  host: string;
  dialect: Dialect;
  port: number;
  synchronize?: boolean;
  logging?: boolean;
};

const POOL_OPTIONS = {
  max: 20,
  min: 0,
  acquire: 60000,
  idle: 60000,
};

@Module({
  imports: [
    // PRIMARY TOLLPLAZA DB -- must be reachable; fail fast on boot if it isn't.
    SequelizeModule.forRootAsync({
      name: DB_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { synchronize, logging, ...db } =
          config.getOrThrow<DatabaseConfig>(`databases.${DB_CONNECTION}`);
        return {
          ...db,
          autoLoadModels: true,
          // creates missing tables only; never alters existing ones
          synchronize: synchronize ?? false,
          logging: logging ? console.log : false,
          // Read and write every DATETIME as UTC (crossings.crossed_at)
          timezone: '+00:00',
          hooks: {
            beforeConnect: (config) => {
              logger.debug(
                `Attempting connection: ${DB_CONNECTION} -> Host: ${config.host}, DB: ${config.database}`,
              );
            },
            afterConnect: () => {
              logger.debug(`Connected successfully: ${DB_CONNECTION}`);
            },
            afterDisconnect: () => {
              logger.debug(`Disconnected from database: ${DB_CONNECTION}`);
            },
          },
          pool: POOL_OPTIONS,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
