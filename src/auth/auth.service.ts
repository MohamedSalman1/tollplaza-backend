import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { SessionService } from '@app/entities/services/session.service';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { User } from '@app/entities/models/user.entity';
import {
  ACTIVE_STATUS,
  DB_CONNECTION,
  type UserRole,
} from '@app/entities/constants/constants';
import { SignInDto } from './dto/signin.dto';
import { HashPasswordDto } from './dto/hash-password.dto';
import { LoginAuditService, type LoginClient } from './login-audit.service';

const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User, DB_CONNECTION)
    private readonly userModel: typeof User,
    private readonly jwtService: JwtService,
    private readonly loginAudit: LoginAuditService,
    private readonly sessions: SessionService,
  ) {}

  async signIn(
    signInDto: SignInDto,
    client: LoginClient,
  ): Promise<{
    message: string;
    name: string;
    email: string;
    role: UserRole;
    token: string;
  }> {
    const { email_address, password } = signInDto;

    // 1. Find user by email_address
    const user = await this.userModel.findOne({
      where: { email_address },
    });

    // 2. Verify password using argon2. Unknown email and wrong password give
    // the same response, so the endpoint can't be used to discover accounts.
    if (!user || !(await this.verifyPassword(user.password, password))) {
      await this.loginAudit.record(
        {
          email: email_address,
          user_id: user?.id ?? null,
          success: false,
          failure_reason: user ? 'wrong_password' : 'unknown_email',
        },
        client,
      );
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // 3. Check status (after the password, for the same reason)
    if (user.status !== ACTIVE_STATUS) {
      await this.loginAudit.record(
        {
          email: email_address,
          user_id: user.id,
          success: false,
          failure_reason: 'inactive',
        },
        client,
      );
      throw new ForbiddenException(
        'Your account is inactive, please contact support!',
      );
    }

    // 4. Generate JWT (expiry configured in JwtModule)
    const payload = {
      sub: user.id,
      email: user.email_address,
      name: user.name,
      role: user.role,
      jti: randomUUID(),
      iat_ms: Date.now(),
    };

    const token = await this.jwtService.signAsync(payload);
    await this.loginAudit.record(
      { email: email_address, user_id: user.id, success: true },
      client,
    );

    return {
      message: 'Sign in successful',
      name: user.name,
      email: user.email_address,
      role: user.role,
      token,
    };
  }

  /**
   * Ends this session, or with `all` every session the user has open. The
   * token stops working at once (and open live streams close) instead of
   * at its expiry.
   */
  async logout(user: JwtPayload, all = false) {
    if (all) {
      await this.sessions.revokeAllSessions(user);
    } else {
      await this.sessions.revokeSession(user);
    }
  }

  async hashPassword(
    hashPasswordDto: HashPasswordDto,
  ): Promise<{ hashed_password: string }> {
    const { password } = hashPasswordDto;

    try {
      const hashed_password = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
      });

      return { hashed_password };
    } catch {
      throw new InternalServerErrorException('Failed to hash password');
    }
  }

  private async verifyPassword(hash: string, password: string) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // stored value isn't a valid argon2 hash
      return false;
    }
  }
}
