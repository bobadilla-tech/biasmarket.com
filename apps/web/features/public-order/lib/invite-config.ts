// Everything a product owner may want to tune about "save this order"
// invitations lives here: the dismissal window, which moments are on, and
// their priority. The rules themselves are in invite-rules.ts; the texts are
// in packages/i18n (storefront.publicOrder.invite).
export const INVITE_MOMENTS = [
  "entrega",
  "pago_validado",
  "banner",
  "adelanto_linea_de_tiempo",
] as const;

export type InviteMoment = (typeof INVITE_MOMENTS)[number];

export interface InviteConfig {
  // How long "Ahora no" hides the banner (and the first-validation block).
  dismissDays: number;
  // Highest priority first; at most ONE of these shows per page. Remove a
  // moment to switch it off.
  priority: readonly InviteMoment[];
  // After "Ahora no", keep the quiet line inside the history section
  // (`adelanto_linea_de_tiempo`) instead of showing nothing at all.
  adelantoAfterDismiss: boolean;
}

export const INVITE_CONFIG: InviteConfig = {
  dismissDays: 7,
  priority: ["entrega", "pago_validado", "banner", "adelanto_linea_de_tiempo"],
  adelantoAfterDismiss: true,
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const dismissWindowMs = (config: InviteConfig = INVITE_CONFIG) =>
  config.dismissDays * DAY_MS;
