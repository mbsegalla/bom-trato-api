import { Controller, Get, Header, Param, ParseUUIDPipe, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import {
  GetPublicPortfolioPhotoContentUseCase,
} from '../../../application/useCases/getPublicPortfolioPhotoContent.useCase.js';
import { publicProfileOperation } from '../../../../publicProfiles/presentation/http/publicProfileHttpError.js';

@ApiTags('Public professional portfolio')
@PublicRoute()
@Controller('public/professionals/:slug/portfolio')
export class PublicPortfolioImagesController {
  constructor(private readonly getPhoto: GetPublicPortfolioPhotoContentUseCase) {}

  @Get(':photoId/content')
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Get a published, explicitly consented portfolio photograph' })
  @ApiProduces('image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async content(
    @Param('slug') slug: string,
    @Param('photoId', new ParseUUIDPipe({ version: '4' })) photoId: string,
  ): Promise<StreamableFile> {
    const bytes = await publicProfileOperation(() => this.getPhoto.execute(slug.trim().toLowerCase(), photoId));
    return new StreamableFile(bytes, { type: 'image/webp', length: bytes.length, disposition: 'inline' });
  }
}
