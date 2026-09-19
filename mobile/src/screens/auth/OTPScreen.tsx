import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { useAuthStore } from '../../store/useAuthStore';
import { RootStackParamList } from '../../types';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthButton from '../../components/auth/AuthButton';

type OTPRoute = RouteProp<RootStackParamList, 'OTP'>;

export default function OTPScreen() {
  const route = useRoute<OTPRoute>();
  const { email } = route.params;
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<number | null>(null);
  const inputs = useRef<(TextInput | null)[]>([]);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const sendOtp = useAuthStore((s) => s.sendOtp);
  const { colorScheme } = useColorScheme();
  const caret = colorScheme === 'dark' ? '#4ade80' : '#16a34a';

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
      Alert.alert('Code incomplet', 'Saisissez les 6 chiffres reçus.');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(email, otpCode);
    } catch (err: any) {
      Alert.alert('Erreur', err?.response?.data?.message || 'Code invalide');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await sendOtp(email);
      Alert.alert('Code renvoyé', 'Un nouveau code vient de vous être envoyé.');
    } catch {
      Alert.alert('Erreur', 'Envoi du code impossible');
    }
  };

  return (
    <AuthLayout
      title="Vérification"
      subtitle={`Saisissez le code à 6 chiffres envoyé à ${email}`}
    >
      <View className="flex-row justify-between mb-8">
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => { inputs.current[index] = ref; }}
            // La case active se distingue par sa bordure : sans repere, on ne
            // sait pas ou l'on en est dans la saisie.
            className={`bg-surface-card dark:bg-dark-100 text-ink-900 dark:text-white text-center text-2xl font-bold rounded-xl w-12 h-14 border-2 ${
              focused === index
                ? 'border-primary-500'
                : 'border-ink-200 dark:border-transparent'
            }`}
            selectionColor={caret}
            maxLength={1}
            keyboardType="number-pad"
            value={digit}
            onFocus={() => setFocused(index)}
            onBlur={() => setFocused((i) => (i === index ? null : i))}
            onChangeText={(v) => handleChange(v, index)}
            onKeyPress={({ nativeEvent }) =>
              handleKeyPress(nativeEvent.key, index)
            }
          />
        ))}
      </View>

      <AuthButton
        label="Vérifier"
        loadingLabel="Vérification…"
        loading={loading}
        onPress={() => handleVerify()}
      />

      <TouchableOpacity className="items-center py-2" onPress={handleResend}>
        <Text className="text-ink-500 dark:text-slate-400">
          Code non reçu ?{' '}
          <Text className="text-primary-600 dark:text-primary-400 font-semibold">
            Renvoyer
          </Text>
        </Text>
      </TouchableOpacity>
    </AuthLayout>
  );
}
