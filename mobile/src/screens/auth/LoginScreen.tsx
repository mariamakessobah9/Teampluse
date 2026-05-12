import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store/useAuthStore';
import { RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const nav = useNavigation<Nav>();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      await login(cleanEmail, password);
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.code === 'EMAIL_NOT_VERIFIED') {
        Alert.alert(
          'Verify your email',
          'We sent you a new 6-digit code.',
          [{ text: 'OK', onPress: () => nav.navigate('OTP', { email: data.email ?? cleanEmail }) }],
        );
      } else if (!err?.response) {
        Alert.alert('Network error', `Cannot reach server.\n${err?.message ?? ''}`);
      } else {
        Alert.alert('Error', data?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-dark-200"
    >
      <View className="flex-1 justify-center px-8">
        <Text className="text-4xl font-bold text-white mb-2">TeamPulse</Text>
        <Text className="text-slate-400 text-base mb-10">
          Sign in to continue
        </Text>

        <TextInput
          className="bg-dark-100 text-white rounded-xl px-4 py-4 mb-4 text-base"
          placeholder="Email"
          placeholderTextColor="#64748b"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          className="bg-dark-100 text-white rounded-xl px-4 py-4 mb-6 text-base"
          placeholder="Password"
          placeholderTextColor="#64748b"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          className={`rounded-xl py-4 items-center mb-4 ${
            loading ? 'bg-primary-800' : 'bg-primary-600'
          }`}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text className="text-white font-bold text-base">
            {loading ? 'Signing in...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="items-center py-2 mb-2"
          onPress={() => nav.navigate('ForgotPassword')}
        >
          <Text className="text-primary-500 font-semibold">Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="items-center py-2"
          onPress={() => nav.navigate('Register')}
        >
          <Text className="text-slate-400">
            Don't have an account?{' '}
            <Text className="text-primary-500 font-semibold">Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
