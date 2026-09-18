# FieldOps Field (`mobileapp_client/field`)

React Native CLI app for Monteure (`de.fieldops.field`). Dark night-gold UI. Not Expo.

## Layout

```
App.tsx           Login, tour, job sheet, assignment banner, Konto + CMS pages
src/api.ts        fetch to /api/v1 with Bearer token
src/config.ts     Live API; `USE_LOCAL_API` for emulator/simulator
src/theme.ts      Field colors + cardShadow
```

Token: AsyncStorage `fieldops.field.token`. Polls jobs + notifications every 8s. New `job.assigned` notices vibrate and show a banner.

Tabs: Heute, Tour, Post, Konto. Login and Konto link to Super Admin CMS (`audience=field`).

## Run

Default API: `https://fieldops-backend-app.onrender.com`. For local Laravel, set `USE_LOCAL_API` in `src/config.ts`.

```powershell
cd mobileapp_client/field
npm install
npm start
npm run android
# iOS: npm run ios
```

Login: `ali.kaya@fieldops.test` / `FieldOps!2026`.

Physical device against local API: set `USE_LOCAL_API` and replace the host with your machine LAN IP.
