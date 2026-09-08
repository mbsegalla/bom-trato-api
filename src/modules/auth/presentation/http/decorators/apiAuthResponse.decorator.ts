import type { Type } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export function ApiAuthResponse(model: Type<unknown>, status = 200, array = false) {
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
            example: status,
          },
          success: {
            type: 'boolean',
            enum: [true],
          },
          data: array
            ? {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              }
            : {
                $ref: getSchemaPath(model),
              },
        },
      },
    }),
  );
}
