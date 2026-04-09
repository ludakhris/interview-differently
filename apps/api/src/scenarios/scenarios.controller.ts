import { Controller, Get, Post, Put, Delete, Patch, Param, Body, HttpCode } from '@nestjs/common'
import { ScenariosService } from './scenarios.service'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scenario = any

@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  @Get()
  findAll() {
    return this.scenariosService.findAll()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scenariosService.findOne(id)
  }

  @Post()
  create(@Body() scenario: Scenario) {
    return this.scenariosService.create(scenario)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() scenario: Scenario) {
    return this.scenariosService.update(id, scenario)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.scenariosService.remove(id)
  }

  @Patch(':id/publish')
  publish(@Param('id') id: string) {
    return this.scenariosService.publish(id)
  }
}
