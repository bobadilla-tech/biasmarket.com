export type SuggestionSeverity = 'info' | 'warning' | 'critical';

export interface Suggestion {
  id: string;
  severity: SuggestionSeverity;
  titleKey: string;
  bodyParams: Record<string, string | number>;
}
