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
import { useRoute, RouteProp } from '@react-navigation/native';
import { useAuthStore } from '../../store/useAuthStore';
import { RootStackParamList } from '../../types';

type Route = RouteProp<RootStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen() {
  const route = useRoute<Route>();
  const { email } = route.params;
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const handleSubmit = async () => {
    if (otp.length !== 6) {
      Alert.alert('Error', 'Enter the 6-digit code');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email, otp, password);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Reset failed');
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
        <Text className="text-3xl font-bold text-white mb-2">Reset password</Text>
        <Text className="text-slate-400 text-base mb-8">
          Enter the 6-digit code sent to {email} and choose a new password.
        </Text>

        <TextInput
          className="bg-dark-100 text-white rounded-xl px-4 py-4 mb-4 text-base tracking-widest"
          placeholder="6-digit code"
          placeholderTextColor="#64748b"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
        />

        <TextInput
          className="bg-dark-100 text-white rounded-xl px-4 py-4 mb-6 text-base"
          placeholder="New password (min 6 characters)"
          placeholderTextColor="#64748b"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          className={`rounded-xl py-4 items-center mb-4 ${
            loading ? 'bg-primary-800' : 'bg-primary-600'
          }`}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text className="text-white font-bold text-base">
            {loading ? 'Resetting...' : 'Reset password'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
