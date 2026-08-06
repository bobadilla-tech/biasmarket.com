export type VariantDraft = {
  name: string;
  stock?: number;
  priceOverride?: number;
  attributes?: Record<string, string>;
};

export type OptionTypeDraft = {
  id: string;
  name: string;
  values: string[];
};
