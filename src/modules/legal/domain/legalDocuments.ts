export const CURRENT_TERMS_VERSION = '1.0';

export const CURRENT_PRIVACY_NOTICE_VERSION = '1.0';

export const LEGAL_DOCUMENTS_EFFECTIVE_AT = new Date('2026-10-10T00:00:00.000Z');

export const CURRENT_LEGAL_DOCUMENTS = {
  terms: {
    version: CURRENT_TERMS_VERSION,
    effectiveAt: LEGAL_DOCUMENTS_EFFECTIVE_AT,
    path: '/termos',
  },
  privacy: {
    version: CURRENT_PRIVACY_NOTICE_VERSION,
    effectiveAt: LEGAL_DOCUMENTS_EFFECTIVE_AT,
    path: '/privacidade',
  },
};
