# Bias Market Mobile

Expo Router app for Bias Market, managed in the root pnpm workspace.

Start the Expo Go development server from the repository root:

```bash
pnpm turbo run dev --filter=mobile
```

Scan the QR code with Expo Go on an Android device. Routes live in `src/app/`.

## Buyer authentication

The app defaults to `https://api.biasmarket.com/api`. Set `EXPO_PUBLIC_API_URL` (including `/api`) in
the environment before starting Expo to use another API, such as a development
server reachable from the test device.

Buyer sessions are stored in Expo SecureStore. Login uses a store slug, phone,
and password. Account setup uses the confirmation token from the buyer's
invitation, then signs in with the phone and password to establish the native
session. A successful login survives app restarts; logout removes the stored
bearer token and store context.
