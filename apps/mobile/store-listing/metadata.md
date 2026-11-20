# Bias Market mobile store listing and data disclosures

Prepared from the mobile client, buyer-auth and order APIs, the current privacy
policy, and the linked release docs. Text is ready for review and localization
in App Store Connect and Play Console. No screenshots are included.

## Product listing

The app supports English and Spanish. Keep each localized listing in its
matching language.

### Spanish

- Name: `Bias Market`
- App Store subtitle (30 characters max): `Tiendas y compras de nicho`
- Play short description (80 characters max): `Explora tiendas independientes y gestiona tus compras desde el celular.`
- Category: Shopping
- Support contact: `hello@biasmarket.com`
- Description:

  Explora tiendas independientes y sus catálogos de productos. Busca productos,
  revisa sus opciones y arma tu carrito. Completa pedidos para entrega o retiro
  y consulta su estado desde la app.

  Si una tienda ofrece un método de pago manual, puedes adjuntar una imagen del
  comprobante para que esa tienda revise el pago. Bias Market no procesa ese
  pago dentro de la app.

  Inicia sesión con tu cuenta de comprador para consultar tus pedidos y sus
  comprobantes. Puedes explorar tiendas y productos sin iniciar sesión.

### English

- Name: `Bias Market`
- App Store subtitle (30 characters max): `Niche shops and shopping`
- Play short description (80 characters max): `Browse independent shops and manage your orders from your phone.`
- Category: Shopping
- Support contact: `hello@biasmarket.com`
- Description:

  Browse independent shops and their product catalogs. Search for products,
  review available options, and build a cart. Place orders for delivery or
  pickup and check their status in the app.

  If a shop offers a manual payment method, you can attach an image of the
  payment proof for that shop to review. Bias Market does not process that
  payment in the app.

  Sign in to a buyer account to view your orders and their payment proofs. You
  can browse shops and products without signing in.

These descriptions avoid promising shipment tracking: the mobile app shows
order/payment state, while shipment tracking is not built into the app. Buyer
account setup currently uses an invitation; public self-registration is not
offered in the mobile app.

## Privacy and Data safety form worksheet

This is a repository-based mapping, not a declaration submitted to either
store. Apple requires data gathered by the app and integrated partners to be
declared unless it meets every optional-disclosure criterion. Google requires
collection, sharing, purpose, and security answers for the app and its SDKs.
Confirm the final answers against the release binary and store account before
submission.

| Data flow                                                        | Repository evidence and recipients                                                                                                                                                                                                        | App Store Connect mapping to review                                                                                                                                                                                      | Google Play Data safety mapping to review                                                                                                                         | Handling / purpose                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buyer account identity                                           | Buyer account profile includes name, phone, optional email, account ID and password credential. Login/register sends credentials to the API; the mobile bearer token and store slug are persisted in SecureStore.                         | Contact Info: Name, Phone Number, Email Address (where provided); Identifiers: User ID. The credential itself has no direct matching label in the current list; review it against the current App Store Connect choices. | Personal info: Name, Phone number, Email address (where provided), User IDs.                                                                                      | Required to sign in and manage an account. Linked to the buyer account. Password is hashed server-side; the session token is stored in device SecureStore. App functionality/account management, and security. No tracking evidence found in the mobile app dependencies/configuration. |
| Payment-proof image                                              | Buyer selects and compresses an image, then uploads it with an order. API stores it in the private payment-image bucket; the buyer can retrieve it through an authenticated endpoint and that order's seller can review it.               | User Content: Photos or Videos. Also assess Financial Info: Other Financial Info, and Payment Info if the submitted receipt can contain bank-account/card/payment-instrument details.                                    | Photos and videos: Photos. Assess Financial info: Other financial info, and User payment info only if actual uploaded receipts contain financial-account details. | Submitted by the buyer for manual-payment review; linked to the order/account. App functionality and potentially fraud prevention/support. Not end-to-end encrypted: the service and order seller can access it. The seller is the intended recipient of this user-initiated upload.    |
| Orders and purchase details (additional data in the mobile flow) | Checkout, order history, order details, delivery/pickup fields and order status are sent to/read from the API.                                                                                                                            | Purchases: Purchase History; assess Contact Info: Physical Address and Phone Number where collected.                                                                                                                     | Financial info: Purchase history; Personal info: Address and Phone number where collected.                                                                        | Order processing and account functionality. Order data can remain as store transaction records after account deletion; exact proof-image retention for regular buyer orders needs owner confirmation.                                                                                   |
| Buyer push token (additional data found in audit)                | After sign-in, the app checks/request notification permission. If granted, it sends the Expo push token and platform to the API, linked to the buyer account. The API uses it for a notification when the seller reviews a payment proof. | Identifiers: Device ID (confirm in App Store Connect whether the Expo push token is classified here).                                                                                                                    | Device or other IDs.                                                                                                                                              | Optional, permission-gated notification functionality. No advertising or analytics use found.                                                                                                                                                                                           |

### Sharing and retention notes

- Proof images go to Bias Market's API and private object storage, and are
  available to the seller for the order. The storage provider is described in
  the existing policy as a service provider. For Play's **sharing** answer,
  check whether the upload UI makes the seller recipient clear enough for the
  user-initiated-action exception; otherwise declare sharing with the seller.
- Account deletion clears reusable buyer identity and addresses and detaches
  historical orders from the buyer account. It does not itself delete the
  order rows or proof-image references. Repository docs establish a 90-day
  identity/media cleanup only for eligible, unclaimed vendor-assisted orders;
  they do not establish an exact proof-image retention period for regular
  buyer orders. Confirm and align the policy and store declarations before
  submission.
- The current policy says proof images are visible to the seller and Bias
  Market for support/fraud prevention, and permits retention of order/payment
  records after account deletion. It did not describe buyer push tokens; the
  English and Spanish policy text now records that flow in
  `packages/i18n/{en,es}/marketing.json`.
- The mobile client contains Expo Notifications, SecureStore, and image picker
  dependencies. No mobile analytics or advertising SDK was found in
  `apps/mobile/package.json`; review the final native dependency inventory and
  any build-time SDK/config changes before submitting declarations.

## Submission gates

- Confirm the public privacy-policy URL resolves in both locales. Expected
  routes: `https://biasmarket.com/en/privacy` and
  `https://biasmarket.com/es/privacy`.
- Confirm the Google Play account-deletion web URL resolves and is configured
  in Play Console: `https://biasmarket.com/es/my-purchases`. The app also has
  an in-app delete-account action. Verify both account-deletion flows on the
  release build and confirm how retained order proofs are handled.
- Capture final localized screenshots on physical iOS and Android devices after
  beta approval. Screenshot UI assets are not part of this repository change.
- Store credentials, declarations, listing entry, submission, review, and
  release require the store account owner. Do not treat a build or this
  worksheet as a store submission.
- A real EAS Update to the production channel without store resubmission remains
  a production verification gate. This change does not run that update.

## Official terminology and limits

- [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple App Store Connect app information and metadata limits](https://developer.apple.com/help/app-store-connect/reference/app-information/app-and-compliance-information/)
- [Google Play Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play store listing fields and limits](https://support.google.com/googleplay/android-developer/answer/9859152)
