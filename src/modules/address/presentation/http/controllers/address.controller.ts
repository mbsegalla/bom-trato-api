import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { GetAddressByPostalCodeUseCase } from '../../../application/useCases/getAddressByPostalCode.useCase.js';
import { ListBrazilianCitiesUseCase } from '../../../application/useCases/listBrazilianCities.useCase.js';
import { ListBrazilianStatesUseCase } from '../../../application/useCases/listBrazilianStates.useCase.js';
import type { AddressLookup, BrazilianCity, BrazilianState } from '../../../domain/types/address.types.js';
import { addressOperation } from '../addressHttpError.js';
import {
  AddressLookupResponseDto,
  BrazilianCityResponseDto,
  BrazilianStateResponseDto,
} from '../dtos/responses/addressResponse.dto.js';

@ApiTags('Address')
@ApiBearerAuth('access-token')
@Controller('address')
export class AddressController {
  constructor(
    private readonly getAddressByPostalCodeUseCase: GetAddressByPostalCodeUseCase,
    private readonly listBrazilianStatesUseCase: ListBrazilianStatesUseCase,
    private readonly listBrazilianCitiesUseCase: ListBrazilianCitiesUseCase,
  ) {}

  @Get('postal-codes/:postalCode')
  @ApiOperation({ summary: 'Find Brazilian address by postal code' })
  @ApiParam({
    name: 'postalCode',
    example: '38400000',
  })
  @ApiDataResponse(AddressLookupResponseDto)
  findByPostalCode(@Param('postalCode') postalCode: string): Promise<AddressLookup> {
    return addressOperation(() => this.getAddressByPostalCodeUseCase.execute(postalCode));
  }

  @Get('states')
  @ApiOperation({ summary: 'List Brazilian states' })
  @ApiDataResponse(BrazilianStateResponseDto, { array: true })
  states(): Promise<BrazilianState[]> {
    return addressOperation(() => this.listBrazilianStatesUseCase.execute());
  }

  @Get('states/:state/cities')
  @ApiOperation({ summary: 'List cities from a Brazilian state' })
  @ApiParam({
    name: 'state',
    example: 'MG',
  })
  @ApiDataResponse(BrazilianCityResponseDto, { array: true })
  cities(@Param('state') state: string): Promise<BrazilianCity[]> {
    return addressOperation(() => this.listBrazilianCitiesUseCase.execute(state));
  }
}
