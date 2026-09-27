export interface AddressLookup {
  postalCode: string;
  street: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  cityIbgeCode: string | null;
  stateIbgeCode: string | null;
}

export interface BrazilianState {
  code: string;
  name: string;
}

export interface BrazilianCity {
  code: string;
  name: string;
}
