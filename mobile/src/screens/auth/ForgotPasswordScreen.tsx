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

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const nav = useNavigation<Nav>();

  const handleSubmit = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      await forgotPassword(cleanEmail);
      nav.navigate('ResetPassword', { email: cleanEmail });
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Request failed');
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
        <Text className="text-3xl font-bold text-white mb-2">Forgot password</Text>
        <Text className="text-slate-400 text-base mb-8">
          Enter your email and we'll send you a 6-digit code to reset your password.
        </Text>

        <TextInput
          className="bg-dark-100 text-white rounded-xl px-4 py-4 mb-6 text-base"
          placeholder="Email"
          placeholderTextColor="#64748b"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TouchableOpacity
          className={`rounded-xl py-4 items-center mb-4 ${
            loading ? 'bg-primary-800' : 'bg-primary-600'
          }`}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text className="text-white font-bold text-base">
            {loading ? 'Sending...' : 'Send reset code'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity className="items-center py-2" onPress={() => nav.goBack()}>
          <Text className="text-slate-400">Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
