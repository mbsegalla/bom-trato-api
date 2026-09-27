import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { GetOrganizationProfileUseCase } from '../../../application/useCases/getOrganizationProfile.useCase.js';
import { RemoveOrganizationLogoUseCase } from '../../../application/useCases/removeOrganizationLogo.useCase.js';
import { UpdateOrganizationProfileUseCase } from '../../../application/useCases/updateOrganizationProfile.useCase.js';
import { UploadOrganizationLogoUseCase } from '../../../application/useCases/uploadOrganizationLogo.useCase.js';
import { UpdateOrganizationProfileDto } from '../dtos/requests/organizationProfile.dto.js';
import { OrganizationProfileResponseDto } from '../dtos/responses/organizationProfileResponse.dto.js';
import { organizationProfileOperation } from '../organizationProfileHttpError.js';

interface UploadedLogoFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const uuid = new ParseUUIDPipe({
  version: '4',
});

@ApiTags('Organization profile')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/profile')
export class OrganizationProfileController {
  constructor(
    private readonly getOrganizationProfileUseCase: GetOrganizationProfileUseCase,
    private readonly updateOrganizationProfileUseCase: UpdateOrganizationProfileUseCase,
    private readonly uploadOrganizationLogoUseCase: UploadOrganizationLogoUseCase,
    private readonly removeOrganizationLogoUseCase: RemoveOrganizationLogoUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get organization business profile' })
  @ApiDataResponse(OrganizationProfileResponseDto)
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
  ): Promise<OrganizationProfileResponseDto> {
    return organizationProfileOperation(() =>
      this.getOrganizationProfileUseCase.execute({
        organizationId,
        userId: auth.user.id,
      }),
    );
  }

  @Patch()
  @ApiOperation({ summary: 'Update organization business profile' })
  @ApiDataResponse(OrganizationProfileResponseDto)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Body() dto: UpdateOrganizationProfileDto,
  ): Promise<OrganizationProfileResponseDto> {
    return organizationProfileOperation(() =>
      this.updateOrganizationProfileUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        dto,
      ),
    );
  }

  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: {
        files: 1,
        fileSize: 2 * 1024 * 1024,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload organization logo' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['logo'],
      properties: {
        logo: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiDataResponse(OrganizationProfileResponseDto)
  uploadLogo(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @UploadedFile() file: UploadedLogoFile | undefined,
  ): Promise<OrganizationProfileResponseDto> {
    if (!file) {
      return organizationProfileOperation(() =>
        this.uploadOrganizationLogoUseCase.execute(
          {
            organizationId,
            userId: auth.user.id,
          },
          {
            buffer: Buffer.alloc(0),
            mimeType: '',
            size: 0,
          },
        ),
      );
    }

    return organizationProfileOperation(() =>
      this.uploadOrganizationLogoUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        {
          buffer: file.buffer,
          mimeType: file.mimetype,
          size: file.size,
        },
      ),
    );
  }

  @Delete('logo')
  @ApiOperation({ summary: 'Remove organization logo' })
  @ApiDataResponse(OrganizationProfileResponseDto)
  removeLogo(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
  ): Promise<OrganizationProfileResponseDto> {
    return organizationProfileOperation(() =>
      this.removeOrganizationLogoUseCase.execute({
        organizationId,
        userId: auth.user.id,
      }),
    );
  }
}
