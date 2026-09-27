import { Module } from '@nestjs/common';

import { AddressProvider } from './application/ports/addressProvider.port.js';
import { GetAddressByPostalCodeUseCase } from './application/useCases/getAddressByPostalCode.useCase.js';
import { ListBrazilianCitiesUseCase } from './application/useCases/listBrazilianCities.useCase.js';
import { ListBrazilianStatesUseCase } from './application/useCases/listBrazilianStates.useCase.js';
import { BrasilApiAddressProvider } from './infrastructure/providers/brasilApiAddress.provider.js';
import { AddressController } from './presentation/http/controllers/address.controller.js';

@Module({
  controllers: [AddressController],
  providers: [
    BrasilApiAddressProvider,
    {
      provide: AddressProvider,
      useExisting: BrasilApiAddressProvider,
    },
    {
      provide: GetAddressByPostalCodeUseCase,
      useFactory: (provider: AddressProvider) => new GetAddressByPostalCodeUseCase(provider),
      inject: [AddressProvider],
    },
    {
      provide: ListBrazilianStatesUseCase,
      useFactory: () => new ListBrazilianStatesUseCase(),
    },
    {
      provide: ListBrazilianCitiesUseCase,
      useFactory: (provider: AddressProvider) => new ListBrazilianCitiesUseCase(provider),
      inject: [AddressProvider],
    },
  ],
})
export class AddressModule {}
