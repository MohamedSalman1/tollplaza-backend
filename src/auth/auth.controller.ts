import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '@app/entities/decorators/current-user.decorator';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/signin.dto';
import { HashPasswordDto } from './dto/hash-password.dto';
import { LogoutDto } from './dto/logout.dto';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() signInDto: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // req.ip honours http.trust_proxy (X-Forwarded-For behind a proxy)
    const { token, ...result } = await this.authService.signIn(signInDto, {
      ip: req.ip ?? null,
      user_agent: req.headers['user-agent'] ?? null,
    });

    // Exposed to the browser by the CORS config in main.ts
    res.setHeader('Authorization', `Bearer ${token}`);

    return {
      statusCode: HttpStatus.OK,
      ...result,
    };
  }

  /**
   * POST /auth/logout
   * Ends this session; { "all": true } ends every session of this user.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: JwtPayload, @Body() logoutDto: LogoutDto) {
    await this.authService.logout(user, logoutDto.all ?? false);
    return {
      statusCode: HttpStatus.OK,
      message: logoutDto.all ? 'Signed out of all sessions' : 'Signed out',
    };
  }

  /**
   * GET /auth/me
   * Returns the logged in user's token payload
   */
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return {
      statusCode: HttpStatus.OK,
      user,
    };
  }

  /**
   * POST /auth/hash-password
   * Returns argon2 hashed version of a plain text password
   */
  @Post('hash-password')
  @HttpCode(HttpStatus.OK)
  async hashPassword(@Body() hashPasswordDto: HashPasswordDto) {
    const result = await this.authService.hashPassword(hashPasswordDto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Password hashed successfully',
      ...result,
    };
  }
}
