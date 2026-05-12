import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useAuthStore } from '../../store/useAuthStore';
import { RootStackParamList } from '../../types';

type OTPRoute = RouteProp<RootStackParamList, 'OTP'>;

export default function OTPScreen() {
  const route = useRoute<OTPRoute>();
  const { email } = route.params;
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const sendOtp = useAuthStore((s) => s.sendOtp);

  const handleChange = (value: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputs.current[index + 1]?.focus();
    }

    // Auto-verify when all digits are filled
    if (index === 5 && value) {
      const code = newOtp.join('');
      if (code.length === 6) {
        handleVerify(code);
      }
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(email, otpCode);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await sendOtp(email);
      Alert.alert('Success', 'OTP sent again');
    } catch {
      Alert.alert('Error', 'Failed to resend OTP');
    }
  };

  return (
    <View className="flex-1 bg-dark-200 justify-center px-8">
      <Text className="text-3xl font-bold text-white mb-2">Verify Email</Text>
      <Text className="text-slate-400 text-base mb-8">
        Enter the 6-digit code sent to {email}
      </Text>

      <View className="flex-row justify-between mb-8">
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => { inputs.current[index] = ref; }}
            className="bg-dark-100 text-white text-center text-2xl font-bold rounded-xl w-12 h-14"
            maxLength={1}
            keyboardType="number-pad"
            value={digit}
            onChangeText={(v) => handleChange(v, index)}
            onKeyPress={({ nativeEvent }) =>
              handleKeyPress(nativeEvent.key, index)
            }
          />
        ))}
      </View>

      <TouchableOpacity
        className={`rounded-xl py-4 items-center mb-4 ${
          loading ? 'bg-primary-800' : 'bg-primary-600'
        }`}
        onPress={() => handleVerify()}
        disabled={loading}
      >
        <Text className="text-white font-bold text-base">
          {loading ? 'Verifying...' : 'Verify'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity className="items-center py-2" onPress={handleResend}>
        <Text className="text-slate-400">
          Didn't receive code?{' '}
          <Text className="text-primary-500 font-semibold">Resend</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}
