import { Platform } from 'react-native';

/** Android emulator reaches the host machine via 10.0.2.2; iOS simulator uses loopback. */
export const API_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';
