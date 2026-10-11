import { Controller, Get, Header, Param, Query } from '@nestjs/common'
import { PublicCatalogService } from './public-catalog.service'
import { Public } from './access/access.decorator'

/** An agency's training catalog. Public: it lists published courses only and never join codes. */
@Controller('learn/public')
export class PublicCatalogController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Get(':tenant/catalog')
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  list(@Param('tenant') tenant: string, @Query('q') q?: string) {
    return this.catalog.catalog(tenant, q)
  }

  @Get(':tenant/courses/:id')
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  offering(@Param('tenant') tenant: string, @Param('id') id: string) {
    return this.catalog.offering(tenant, id)
  }
}
