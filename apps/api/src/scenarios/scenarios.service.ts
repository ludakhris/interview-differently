import { Injectable, NotFoundException } from '@nestjs/common'

// Phase 1: returns stub data. Phase 2: connects to PostgreSQL via Prisma.
@Injectable()
export class ScenariosService {
  findAll() {
    return { scenarios: [], message: 'Connect database to load scenarios' }
  }

  findOne(id: string) {
    if (!id) throw new NotFoundException('Scenario not found')
    return { scenarioId: id, message: 'Connect database to load scenario' }
  }
}
