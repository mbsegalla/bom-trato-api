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
import { AcceptPublicWorkOrderUseCase } from '../../../application/useCases/acceptPublicWorkOrder.useCase.js';
import { GeneratePublicWorkOrderReportUseCase } from '../../../application/useCases/generatePublicWorkOrderReport.useCase.js';
import { GetPublicWorkOrderUseCase } from '../../../application/useCases/getPublicWorkOrder.useCase.js';
import { GetPublicWorkOrderPhotoContentUseCase } from '../../../application/useCases/getPublicWorkOrderPhotoContent.useCase.js';
import { PublicPortfolioConsentUseCase } from '../../../application/useCases/publicPortfolioConsent.useCase.js';
import { PublicWorkOrderTokenDto } from '../dtos/requests/publicWorkOrder.dto.js';
import { AcceptPublicWorkOrderDto } from '../dtos/requests/workOrderAcceptance.dto.js';
import { PortfolioConsentDto, PortfolioRevokeDto } from '../dtos/requests/workOrderPortfolio.dto.js';
import { PublicWorkOrderResponseDto } from '../dtos/responses/publicWorkOrderResponse.dto.js';
import { PublicWorkOrderAcceptanceReceiptResponseDto } from '../dtos/responses/workOrderAcceptanceResponse.dto.js';
import { PortalPortfolioStatusDto } from '../dtos/responses/workOrderPortfolio.dto.js';
import { WorkOrderShareRateLimitGuard } from '../guards/workOrderShareRateLimit.guard.js';
import { workOrderAcceptanceOperation } from '../workOrderAcceptanceHttpError.js';
import { workOrderPhotoOperation } from '../workOrderPhotoHttpError.js';
import { workOrderPortfolioOperation } from '../workOrderPortfolioHttpError.js';
import { workOrderShareOperation } from '../workOrderShareHttpError.js';

@ApiTags('Public work orders')
@PublicRoute()
@UseGuards(WorkOrderShareRateLimitGuard)
@Controller('public/work-orders')
export class PublicWorkOrdersController {
  constructor(
    private readonly getPublicWorkOrderUseCase: GetPublicWorkOrderUseCase,
    private readonly getPublicWorkOrderPhotoContentUseCase: GetPublicWorkOrderPhotoContentUseCase,
    private readonly acceptPublicWorkOrderUseCase: AcceptPublicWorkOrderUseCase,
    private readonly generatePublicWorkOrderReportUseCase: GeneratePublicWorkOrderReportUseCase,
    private readonly portfolioConsent: PublicPortfolioConsentUseCase,
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

  @Post('acceptance')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Record explicit customer acceptance of the completed service snapshot' })
  @ApiDataResponse(PublicWorkOrderAcceptanceReceiptResponseDto)
  accept(@Body() dto: AcceptPublicWorkOrderDto): Promise<PublicWorkOrderAcceptanceReceiptResponseDto> {
    return workOrderAcceptanceOperation(() => this.acceptPublicWorkOrderUseCase.execute(dto.token, dto));
  }

  @Post('report.pdf')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Download a share-scoped work order report without private customer fields' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async report(@Body() dto: PublicWorkOrderTokenDto): Promise<StreamableFile> {
    const bytes = await workOrderShareOperation(() => this.generatePublicWorkOrderReportUseCase.execute(dto.token));

    return new StreamableFile(bytes, {
      type: 'application/pdf',
      length: bytes.length,
      disposition: 'attachment; filename="relatorio-atendimento.pdf"',
    });
  }

  @Post('portfolio/status')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read photo publication consent status using the private share token' })
  @ApiDataResponse(PortalPortfolioStatusDto)
  portfolioStatus(@Body() dto: PublicWorkOrderTokenDto): Promise<PortalPortfolioStatusDto> {
    return workOrderPortfolioOperation(() => this.portfolioConsent.status(dto.token));
  }

  @Post('portfolio/consent')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Record explicit customer authorization to publish selected service photographs' })
  @ApiDataResponse(PortalPortfolioStatusDto)
  authorizePortfolio(@Body() dto: PortfolioConsentDto): Promise<PortalPortfolioStatusDto> {
    return workOrderPortfolioOperation(() => this.portfolioConsent.consent(dto.token, dto));
  }

  @Post('portfolio/revoke')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Withdraw public portfolio authorization for a selected photograph' })
  @ApiDataResponse(PortalPortfolioStatusDto)
  revokePortfolio(@Body() dto: PortfolioRevokeDto): Promise<PortalPortfolioStatusDto> {
    return workOrderPortfolioOperation(() => this.portfolioConsent.revoke(dto.token, dto.photoId));
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
