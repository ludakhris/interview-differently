import { Module } from '@nestjs/common'
import { ScenariosController } from './scenarios.controller'
import { ScenariosService } from './scenarios.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [ScenariosController],
  providers: [ScenariosService],
})
export class ScenariosModule {}
