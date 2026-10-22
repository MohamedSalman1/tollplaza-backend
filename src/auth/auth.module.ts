import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '@app/entities/models/user.entity';
import { LoginAudit } from '@app/entities/models/login-audit.entity';
import { LoginAuditService } from './login-audit.service';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import { SequelizeModule } from '@nestjs/sequelize';

@Module({
  imports: [SequelizeModule.forFeature([User, LoginAudit], DB_CONNECTION)],
  controllers: [AuthController],
  providers: [AuthService, LoginAuditService],
  exports: [AuthService],
})
export class AuthModule {}
