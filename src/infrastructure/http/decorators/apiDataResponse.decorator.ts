import type { Type } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export interface ApiDataResponseOptions {
  status?: number;
  array?: boolean;
  nullable?: boolean;
}

export function ApiDataResponse(
  model: Type<unknown>,
  { status = 200, array = false, nullable = false }: ApiDataResponseOptions = {},
) {
  const modelSchema = { $ref: getSchemaPath(model) };

  const valueSchema = array
    ? {
        type: 'array' as const,
        items: modelSchema,
      }
    : modelSchema;

  const dataSchema = nullable
    ? {
        anyOf: [
          valueSchema,
          {
            type: 'object' as const,
            nullable: true,
            enum: [null],
          },
        ],
      }
    : valueSchema;

  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      schema: {
        type: 'object',
        required: ['statusCode', 'success', 'data'],
        properties: {
          statusCode: {
            type: 'integer',
            enum: [status],
          },
          success: {
            type: 'boolean',
            enum: [true],
          },
          data: dataSchema,
        },
      },
    }),
  );
}
