# Bias Market mobile listing draft

## Product text

- Name: Bias Market
- Subtitle: Descubre tiendas y compra productos de nicho.
- Short description: Explora tiendas independientes, arma tu carrito y sigue
  tus pedidos desde el celular.
- Long description: Bias Market reúne tiendas independientes y productos de
  nicho. Explora catálogos públicos, guarda productos en el carrito, completa
  compras y consulta el estado de tus pedidos. Cuando una tienda usa pago
  manual, puedes enviar el comprobante desde la app y seguir su revisión.
- Category: Shopping
- Support contact: support@biasmarket.com

## Privacy declarations to complete in both stores

The app processes buyer name, phone number, optional email, account credentials,
orders, delivery details, and payment-proof images. The proof image is sent to
the selected store for payment review. The app does not collect or process card
numbers or card security codes. Device push tokens are stored to deliver order
and payment status notifications; users can disable notification permission in
the operating system settings.

Before store submission, the owner must provide the public privacy policy URL,
confirm data retention and deletion practices, and complete Apple's App Privacy
and Google's Data safety forms. No screenshots are included yet; capture the
final localized app on iOS and Android after the staging beta is approved.

## Store submission blockers

- Account deletion is not implemented. Before submitting, add an in-app delete
  account action, the authenticated API endpoint and confirmation flow, then
  publish the web deletion request URL required by Google Play. Verify that
  deletion removes or anonymizes buyer profile data, push tokens, and account
  credentials while preserving order records only where legally required.
- Do not submit either store listing until the account deletion flow is live
  and tested on both platforms.
