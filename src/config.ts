import { Platform } from 'react-native';

const LIVE_API = 'https://fieldops-backend-app.onrender.com';

/** Set true to hit local `php artisan serve` from emulator/simulator. */
const USE_LOCAL_API = false;

export const API_URL = USE_LOCAL_API
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : 'http://127.0.0.1:8000'
  : LIVE_API;
