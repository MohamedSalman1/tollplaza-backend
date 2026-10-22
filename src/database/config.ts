import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { DB_CONNECTION } from '../../libs/entities/src/constants/constants';

// sequelize-cli reads the same config/<NODE_ENV>.yaml as the app, keyed by
// NODE_ENV (loaded from .env by env-cmd in the package.json scripts).
const env = process.env.NODE_ENV;
if (!env) {
  throw new Error(
    'NODE_ENV is not set. Set it in .env, e.g. NODE_ENV=tollplaza.local',
  );
}

const yamlPath = path.resolve(process.cwd(), 'config', `${env}.yaml`);
const parsed = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as {
  databases: Record<string, Record<string, unknown>>;
};

// synchronize is an app-only option, not a Sequelize connection option.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { synchronize, logging, ...db } = parsed.databases[DB_CONNECTION];

const conf = {
  [env]: { ...db, logging: logging ? console.log : false },
};

export default conf;
