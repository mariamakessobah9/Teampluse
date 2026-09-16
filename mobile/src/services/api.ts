import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const BACKEND_PORT = 3000;

/**
 * Origine publique du backend, injectee au moment du build via eas.json.
 * Ex: https://teampulse-production.up.railway.app
 * Sans elle, un build de production n'a aucun serveur a joindre.
 */
const PROD_ORIGIN = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

/** Resolution de l'adresse du backend en developpement uniquement. */
function resolveDevOrigin(): string {
  // 1. variable d'env optionnelle (override manuel)
  const envHost = process.env.EXPO_PUBLIC_API_HOST;
  if (envHost) return `http://${envHost}:${BACKEND_PORT}`;

  // 2. expo-constants connait l'IP du dev server (Expo Go, dev client...)
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any).expoGoConfig?.debuggerHost ??
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${BACKEND_PORT}`;
  }

  // 3. fallbacks par plateforme
  if (Platform.OS === 'android') return `http://10.0.2.2:${BACKEND_PORT}`; // emulateur
  return `http://localhost:${BACKEND_PORT}`; // iOS sim / web
}

if (!__DEV__ && !PROD_ORIGIN) {
  // Sans cette variable, le build retombe sur 10.0.2.2 (adresse de l'emulateur)
  // et toutes les requetes echouent sur un vrai telephone.
  console.error(
    '[api] EXPO_PUBLIC_API_URL manquant : ce build de production ne pourra joindre aucun serveur.',
  );
}

export const SOCKET_URL = PROD_ORIGIN ?? resolveDevOrigin();
export const API_URL = `${SOCKET_URL}/api`;

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
