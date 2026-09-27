import { brazilianStates } from '../../../../shared/states/brazilianStates.js';
import type { BrazilianState } from '../../domain/types/address.types.js';

export class ListBrazilianStatesUseCase {
  async execute(): Promise<BrazilianState[]> {
    return brazilianStates.map((state) => ({
      code: state.code,
      name: state.name,
    }));
  }
}
