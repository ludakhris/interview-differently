import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ClerkService } from '../auth/clerk.service'
import { PrismaService } from '../prisma/prisma.service'
import { ActivityModule } from './activity/activity.module'
import { ActivityService } from './activity/activity.service'
import { AttendanceModule } from './attendance/attendance.module'
import { AttendanceService } from './attendance/attendance.service'
import { DataAccessLogService } from './data-access-log.service'
import { OutcomesModule } from './outcomes/outcomes.module'
import { OutcomesService } from './outcomes/outcomes.service'
import { ProviderAccessService } from './provider-access.service'
import { TalentModule } from './talent/talent.module'
import { TalentService } from './talent/talent.service'

// The real AuthModule is global; a stand-in for the guard's ClerkService is enough here.
@Global()
@Module({ providers: [{ provide: ClerkService, useValue: {} }], exports: [ClerkService] })
class FakeAuthModule {}

// The feature modules must wire up: each gets the shared access layer by injection.
describe('feature modules (#69)', () => {
  it('compile with the shared access services', async () => {
    const mod = await Test.createTestingModule({
      imports: [FakeAuthModule, OutcomesModule, TalentModule, AttendanceModule, ActivityModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile()
    for (const S of [OutcomesService, TalentService, AttendanceService, ActivityService]) {
      const s = mod.get(S) as { access: unknown; audit: unknown }
      expect(s.access).toBeInstanceOf(ProviderAccessService)
      expect(s.audit).toBeInstanceOf(DataAccessLogService)
    }
  })
})
