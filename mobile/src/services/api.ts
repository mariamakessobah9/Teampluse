import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const BACKEND_PORT = 3000;

function resolveHost(): string {
  // 1. variable d'env optionnelle (override manuel)
  const envHost = process.env.EXPO_PUBLIC_API_HOST;
  if (envHost) return envHost;

  // 2. expo-constants connaît l'IP du dev server (Expo Go, dev client...)
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any).expoGoConfig?.debuggerHost ??
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return host;

  // 3. fallbacks par plateforme
  if (Platform.OS === 'android') return '10.0.2.2'; // émulateur Android
  return 'localhost'; // iOS sim / web
}

export const API_URL = `http://${resolveHost()}:${BACKEND_PORT}/api`;
export const SOCKET_URL = `http://${resolveHost()}:${BACKEND_PORT}`;

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
