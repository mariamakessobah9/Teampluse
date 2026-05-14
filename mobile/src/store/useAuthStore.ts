import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  register: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  loadToken: () => Promise<void>;
  updateProfile: (payload: { name?: string; avatar?: string | null }) => Promise<User>;
}

const persistAuth = async (
  token: string,
  user: User,
  set: (partial: Partial<AuthState>) => void,
) => {
  await SecureStore.setItemAsync('token', token);
  set({ user, token, isAuthenticated: true });
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  register: async (name, email, password) => {
    await api.post('/auth/register', { name, email, password });
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    await persistAuth(data.token, data.user, set);
  },

  sendOtp: async (email) => {
    await api.post('/auth/send-otp', { email });
  },

  verifyOtp: async (email, otp) => {
    const { data } = await api.post('/auth/verify-otp', { email, otp });
    await persistAuth(data.token, data.user, set);
  },

  forgotPassword: async (email) => {
    await api.post('/auth/forgot-password', { email });
  },

  resetPassword: async (email, otp, newPassword) => {
    const { data } = await api.post('/auth/reset-password', {
      email,
      otp,
      newPassword,
    });
    await persistAuth(data.token, data.user, set);
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadToken: async () => {
    const token = await SecureStore.getItemAsync('token');
    if (token) {
      try {
        const { data } = await api.get('/users/me');
        set({ token, user: data, isAuthenticated: true, isLoading: false });
      } catch {
        await SecureStore.deleteItemAsync('token');
        set({ isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },

  updateProfile: async (payload) => {
    const { data } = await api.patch('/users/me', payload);
    set({ user: data });
    return data;
  },
}));
