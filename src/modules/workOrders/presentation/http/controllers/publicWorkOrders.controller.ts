import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { GetPublicWorkOrderUseCase } from '../../../application/useCases/getPublicWorkOrder.useCase.js';
import { GetPublicWorkOrderPhotoContentUseCase } from '../../../application/useCases/getPublicWorkOrderPhotoContent.useCase.js';
import { PublicWorkOrderTokenDto } from '../dtos/requests/publicWorkOrder.dto.js';
import { PublicWorkOrderResponseDto } from '../dtos/responses/publicWorkOrderResponse.dto.js';
import { WorkOrderShareRateLimitGuard } from '../guards/workOrderShareRateLimit.guard.js';
import { workOrderPhotoOperation } from '../workOrderPhotoHttpError.js';
import { workOrderShareOperation } from '../workOrderShareHttpError.js';

@ApiTags('Public work orders')
@PublicRoute()
@UseGuards(WorkOrderShareRateLimitGuard)
@Controller('public/work-orders')
export class PublicWorkOrdersController {
  constructor(
    private readonly getPublicWorkOrderUseCase: GetPublicWorkOrderUseCase,
    private readonly getPublicWorkOrderPhotoContentUseCase: GetPublicWorkOrderPhotoContentUseCase,
  ) {}

  @Post('resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read a work order using a private share token',
  })
  @ApiDataResponse(PublicWorkOrderResponseDto)
  resolve(@Body() dto: PublicWorkOrderTokenDto): Promise<PublicWorkOrderResponseDto> {
    return workOrderShareOperation(() => this.getPublicWorkOrderUseCase.execute(dto.token));
  }

  @Post('photos/:photoId/content')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Read a published photo using an active private share token' })
  @ApiProduces('image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async photo(
    @Param('photoId', new ParseUUIDPipe({ version: '4' })) photoId: string,
    @Body() dto: PublicWorkOrderTokenDto,
  ): Promise<StreamableFile> {
    const bytes = await workOrderPhotoOperation(() =>
      this.getPublicWorkOrderPhotoContentUseCase.execute(dto.token, photoId),
    );

    return new StreamableFile(bytes, { type: 'image/webp', length: bytes.length, disposition: 'inline' });
  }
}
