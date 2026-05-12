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

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const nav = useNavigation<Nav>();

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      await register(name, cleanEmail, password);
      nav.navigate('OTP', { email: cleanEmail });
    } catch (err: any) {
      if (!err?.response) {
        Alert.alert('Network error', `Cannot reach server.\n${err?.message ?? ''}`);
      } else {
        Alert.alert(
          'Error',
          err?.response?.data?.message || 'Registration failed',
        );
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
        <Text className="text-4xl font-bold text-white mb-2">
          Create Account
        </Text>
        <Text className="text-slate-400 text-base mb-10">
          Join TeamPulse today
        </Text>

        <TextInput
          className="bg-dark-100 text-white rounded-xl px-4 py-4 mb-4 text-base"
          placeholder="Full Name"
          placeholderTextColor="#64748b"
          value={name}
          onChangeText={setName}
        />

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
          placeholder="Password (min 6 characters)"
          placeholderTextColor="#64748b"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          className={`rounded-xl py-4 items-center mb-4 ${
            loading ? 'bg-primary-800' : 'bg-primary-600'
          }`}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text className="text-white font-bold text-base">
            {loading ? 'Creating account...' : 'Sign Up'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="items-center py-2"
          onPress={() => nav.goBack()}
        >
          <Text className="text-slate-400">
            Already have an account?{' '}
            <Text className="text-primary-500 font-semibold">Sign In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
