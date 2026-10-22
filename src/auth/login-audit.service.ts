import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'net';
import {
  LoginAudit,
  type LoginFailureReason,
} from '@app/entities/models/login-audit.entity';
import { DB_CONNECTION } from '@app/entities/constants/constants';

export type LoginClient = { ip: string | null; user_agent: string | null };

type IpapiResponse = {
  error?: boolean;
  country_name?: string;
  region?: string;
  city?: string;
  org?: string;
};

const LOOKUP_TIMEOUT_MS = 3000;

/**
 * Writes one login_audit row per attempt. The ipapi location lookup runs
 * after the row is written and never blocks or fails the login.
 */
@Injectable()
export class LoginAuditService {
  private readonly logger = new Logger(LoginAuditService.name);

  constructor(
    @InjectModel(LoginAudit, DB_CONNECTION)
    private readonly auditModel: typeof LoginAudit,
    private readonly config: ConfigService,
  ) {}

  async record(
    attempt: {
      email: string;
      user_id: number | null;
      success: boolean;
      failure_reason?: LoginFailureReason;
    },
    client: LoginClient,
  ) {
    try {
      const row = await this.auditModel.create({
        user_id: attempt.user_id,
        email_attempted: attempt.email.slice(0, 255),
        ip: client.ip?.slice(0, 64) ?? null,
        user_agent: client.user_agent?.slice(0, 512) ?? null,
        success: attempt.success,
        failure_reason: attempt.failure_reason ?? null,
      });
      void this.locate(row.id, client.ip);
    } catch (error) {
      // An audit failure must not lock users out
      this.logger.error('Could not write login audit row', error);
    }
  }

  private async locate(id: number, ip: string | null) {
    if (!this.config.get<boolean>('ipapi.enabled', false)) return;
    const address = normalizeIp(ip);
    if (!address || !isPublicIp(address)) return;

    try {
      const key = this.config.get<string>('ipapi.api_key', '');
      const url = `https://ipapi.co/${encodeURIComponent(address)}/json/${key ? `?key=${encodeURIComponent(key)}` : ''}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (!res.ok) return;
      const geo = (await res.json()) as IpapiResponse;
      if (geo.error) return;

      await this.auditModel.update(
        {
          geo_country: geo.country_name?.slice(0, 64) ?? null,
          geo_region: geo.region?.slice(0, 128) ?? null,
          geo_city: geo.city?.slice(0, 128) ?? null,
          geo_org: geo.org?.slice(0, 255) ?? null,
          geo_raw: geo,
        },
        { where: { id } },
      );
    } catch (error) {
      this.logger.warn(
        `ipapi lookup failed for login_audit ${id}: ${String(error)}`,
      );
    }
  }
}

// "::ffff:203.0.113.5" (IPv4 mapped into IPv6) -> "203.0.113.5"
function normalizeIp(ip: string | null): string | null {
  if (!ip) return null;
  const trimmed = ip.trim().replace(/^::ffff:/i, '');
  return isIP(trimmed) ? trimmed : null;
}

/**
 * False for loopback, private, link-local and carrier-grade NAT ranges,
 * which ipapi can't locate (and local development never needs to send).
 */
export function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const lower = ip.toLowerCase();
  return !(
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80')
  );
}
