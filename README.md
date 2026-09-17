# FieldOps Field (`mobileapp_client/field`)

React Native CLI app for Monteure (`de.fieldops.field`). Dark night-gold UI. Not Expo.

## Layout

```
App.tsx           Login, tour, job sheet, assignment banner, Konto + CMS pages
src/api.ts        fetch to /api/v1 with Bearer token
src/config.ts     Android emulator 10.0.2.2, iOS 127.0.0.1
src/theme.ts      Field colors + cardShadow
```

Token: AsyncStorage `fieldops.field.token`. Polls jobs + notifications every 8s. New `job.assigned` notices vibrate and show a banner.

Tabs: Heute, Tour, Post, Konto. Login and Konto link to Super Admin CMS (`audience=field`).

## Run

API must be on `http://127.0.0.1:8000`.

```powershell
cd mobileapp_client/field
npm install
npm start
npm run android
# iOS: npm run ios
```

Login: `ali.kaya@fieldops.test` / `FieldOps!2026`.

Physical device: set `API_URL` in `src/config.ts` to your machine LAN IP.
