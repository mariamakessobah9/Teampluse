import React, { useState } from 'react';
import { Text, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store/useAuthStore';
import { RootStackParamList } from '../../types';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthField from '../../components/auth/AuthField';
import AuthButton from '../../components/auth/AuthButton';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const nav = useNavigation<Nav>();

  const handleSubmit = async () => {
    if (!email) {
      Alert.alert('Champ manquant', 'Saisissez votre adresse e-mail.');
      return;
    }
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      await forgotPassword(cleanEmail);
      nav.navigate('ResetPassword', { email: cleanEmail });
    } catch (err: any) {
      Alert.alert('Erreur', err?.response?.data?.message || 'Demande impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Mot de passe oublié"
      subtitle="Saisissez votre e-mail : nous vous enverrons un code à 6 chiffres pour réinitialiser votre mot de passe."
    >
      <AuthField
        className="mb-6"
        placeholder="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />

      <AuthButton
        label="Envoyer le code"
        loadingLabel="Envoi…"
        loading={loading}
        onPress={handleSubmit}
      />

      <TouchableOpacity className="items-center py-2" onPress={() => nav.goBack()}>
        <Text className="text-ink-500 dark:text-slate-400">
          Retour à la connexion
        </Text>
      </TouchableOpacity>
    </AuthLayout>
  );
}
