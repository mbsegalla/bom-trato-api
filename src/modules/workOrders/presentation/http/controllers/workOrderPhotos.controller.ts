import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import { WorkOrderPhotoStage } from '../../../../../generated/prisma/enums.js';
import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { DeleteWorkOrderPhotoUseCase } from '../../../application/useCases/deleteWorkOrderPhoto.useCase.js';
import { GetWorkOrderPhotoContentUseCase } from '../../../application/useCases/getWorkOrderPhotoContent.useCase.js';
import { ListWorkOrderPhotosUseCase } from '../../../application/useCases/listWorkOrderPhotos.useCase.js';
import { UpdateWorkOrderPhotoUseCase } from '../../../application/useCases/updateWorkOrderPhoto.useCase.js';
import { UploadWorkOrderPhotoUseCase } from '../../../application/useCases/uploadWorkOrderPhoto.useCase.js';
import { WORK_ORDER_PHOTO_MAX_FILE_SIZE } from '../../../domain/entities/workOrderPhoto.entity.js';
import { WorkOrderVersionDto } from '../dtos/requests/workOrder.dto.js';
import { UpdateWorkOrderPhotoDto, UploadWorkOrderPhotoDto } from '../dtos/requests/workOrderPhoto.dto.js';
import { WorkOrderPhotoResponseDto } from '../dtos/responses/workOrderPhotoResponse.dto.js';
import { workOrderPhotoOperation } from '../workOrderPhotoHttpError.js';

interface UploadedPhotoFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Work order photos')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-orders/:workOrderId/photos')
export class WorkOrderPhotosController {
  constructor(
    private readonly listWorkOrderPhotosUseCase: ListWorkOrderPhotosUseCase,
    private readonly uploadWorkOrderPhotoUseCase: UploadWorkOrderPhotoUseCase,
    private readonly updateWorkOrderPhotoUseCase: UpdateWorkOrderPhotoUseCase,
    private readonly deleteWorkOrderPhotoUseCase: DeleteWorkOrderPhotoUseCase,
    private readonly getWorkOrderPhotoContentUseCase: GetWorkOrderPhotoContentUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List work order photos' })
  @ApiDataResponse(WorkOrderPhotoResponseDto, { array: true })
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
  ): Promise<WorkOrderPhotoResponseDto[]> {
    return workOrderPhotoOperation(() =>
      this.listWorkOrderPhotosUseCase.execute({ organizationId, workOrderId, userId: auth.user.id }),
    );
  }

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fields: 2, parts: 4, fileSize: WORK_ORDER_PHOTO_MAX_FILE_SIZE + 1, fieldSize: 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a private work order photo' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'stage'],
      properties: {
        file: { type: 'string', format: 'binary' },
        stage: { type: 'string', enum: Object.values(WorkOrderPhotoStage) },
        caption: { type: 'string', maxLength: 240 },
      },
    },
  })
  @ApiDataResponse(WorkOrderPhotoResponseDto, { status: 201 })
  upload(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: UploadWorkOrderPhotoDto,
    @UploadedFile() file: UploadedPhotoFile | undefined,
  ): Promise<WorkOrderPhotoResponseDto> {
    return workOrderPhotoOperation(() =>
      this.uploadWorkOrderPhotoUseCase.execute({ organizationId, workOrderId, userId: auth.user.id }, dto, {
        buffer: file?.buffer ?? Buffer.alloc(0),
        mimeType: file?.mimetype ?? '',
        size: file?.size ?? 0,
      }),
    );
  }

  @Patch(':photoId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update a work order photo and its portal visibility' })
  @ApiDataResponse(WorkOrderPhotoResponseDto)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Param('photoId', uuid) photoId: string,
    @Body() dto: UpdateWorkOrderPhotoDto,
  ): Promise<WorkOrderPhotoResponseDto> {
    return workOrderPhotoOperation(() =>
      this.updateWorkOrderPhotoUseCase.execute(
        { organizationId, workOrderId, photoId, userId: auth.user.id, version: dto.version },
        dto,
      ),
    );
  }

  @Delete(':photoId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a work order photo' })
  @ApiNoContentResponse()
  delete(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Param('photoId', uuid) photoId: string,
    @Body() dto: WorkOrderVersionDto,
  ): Promise<void> {
    return workOrderPhotoOperation(() =>
      this.deleteWorkOrderPhotoUseCase.execute({
        organizationId,
        workOrderId,
        photoId,
        userId: auth.user.id,
        version: dto.version,
      }),
    );
  }

  @Get(':photoId/content')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Read a private work order photo' })
  @ApiProduces('image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async content(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Param('photoId', uuid) photoId: string,
  ): Promise<StreamableFile> {
    const bytes = await workOrderPhotoOperation(() =>
      this.getWorkOrderPhotoContentUseCase.execute({ organizationId, workOrderId, photoId, userId: auth.user.id }),
    );

    return new StreamableFile(bytes, { type: 'image/webp', length: bytes.length, disposition: 'inline' });
  }
}
