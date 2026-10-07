import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '../../auth/auth.module'
import { LearnModule } from '../../learn/learn.module'
import { PrismaModule } from '../../prisma/prisma.module'
import { LtiStoreModule } from '../lti-store.module'
import { LtiPlatformController } from './lti-platform.controller'
import { LtiPlatformService } from './lti-platform.service'
import { ToolRegistryController } from './tool-registry.controller'
import { ToolRegistryService } from './tool-registry.service'

/**
 * LearnDifferently as an LTI 1.3 platform (#63). LearnModule and this module need each other
 * (the learner API starts launches; scores come back into LearnerService), so each side
 * references the other with forwardRef.
 */
@Module({
  imports: [AuthModule, PrismaModule, LtiStoreModule, forwardRef(() => LearnModule)],
  controllers: [LtiPlatformController, ToolRegistryController],
  providers: [LtiPlatformService, ToolRegistryService],
  exports: [LtiPlatformService, ToolRegistryService],
})
export class LtiPlatformModule {}
