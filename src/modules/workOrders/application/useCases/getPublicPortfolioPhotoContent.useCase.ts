import type { PrivateObjectStorage } from '../../../../shared/storage/privateObjectStorage.port.js';
import { PublicProfileError } from '../../../publicProfiles/domain/errors/publicProfile.error.js';
import type { WorkOrderPortfolioRepository } from '../ports/workOrderPortfolio.repository.js';

export class GetPublicPortfolioPhotoContentUseCase {
  constructor(
    private readonly repository: WorkOrderPortfolioRepository,
    private readonly storage: PrivateObjectStorage,
  ) {}

  async execute(slug: string, photoId: string): Promise<Uint8Array> {
    const key = await this.repository.getPublicPhotoKey(slug, photoId);
    let bytes: Uint8Array;

    try {
      bytes = await this.storage.get(key);
    } catch {
      throw new PublicProfileError('PUBLIC_PROFILE_NOT_FOUND');
    }

    if ((await this.repository.getPublicPhotoKey(slug, photoId)) !== key) {
      throw new PublicProfileError('PUBLIC_PROFILE_NOT_FOUND');
    }

    return bytes;
  }
}
