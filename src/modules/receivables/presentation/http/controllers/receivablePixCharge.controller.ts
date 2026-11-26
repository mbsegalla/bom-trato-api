import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { GetReceivablePixChargeUseCase } from '../../../application/useCases/getReceivablePixCharge.useCase.js';
import { ReceivablePixChargeResponseDto } from '../dtos/responses/receivablePixChargeResponse.dto.js';
import { receivingSettingsOperation } from '../receivingSettingsHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Receivables')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/receivables/:receivableId/pix-charge')
export class ReceivablePixChargeController {
  constructor(private readonly getPixCharge: GetReceivablePixChargeUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Prepare a static Pix BR Code for the current outstanding balance (owner only)' })
  @ApiDataResponse(ReceivablePixChargeResponseDto)
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
  ): Promise<ReceivablePixChargeResponseDto> {
    return receivingSettingsOperation(() =>
      this.getPixCharge.execute({ organizationId, receivableId, userId: auth.user.id }),
    );
  }
}
