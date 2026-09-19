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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const nav = useNavigation<Nav>();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Champs manquants', 'Renseignez votre e-mail et votre mot de passe.');
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
          'Vérifiez votre e-mail',
          'Nous venons de vous envoyer un nouveau code à 6 chiffres.',
          [{ text: 'OK', onPress: () => nav.navigate('OTP', { email: data.email ?? cleanEmail }) }],
        );
      } else if (!err?.response) {
        Alert.alert('Erreur réseau', `Serveur injoignable.\n${err?.message ?? ''}`);
      } else {
        Alert.alert('Erreur', data?.message || 'Connexion impossible');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="TeamPulse" subtitle="Connectez-vous pour continuer">
      <AuthField
        placeholder="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />

      <AuthField
        className="mb-6"
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <AuthButton
        label="Se connecter"
        loadingLabel="Connexion…"
        loading={loading}
        onPress={handleLogin}
      />

      <TouchableOpacity
        className="items-center py-2 mb-2"
        onPress={() => nav.navigate('ForgotPassword')}
      >
        <Text className="text-primary-600 dark:text-primary-400 font-semibold">
          Mot de passe oublié ?
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="items-center py-2"
        onPress={() => nav.navigate('Register')}
      >
        <Text className="text-ink-500 dark:text-slate-400">
          Pas encore de compte ?{' '}
          <Text className="text-primary-600 dark:text-primary-400 font-semibold">
            Créer un compte
          </Text>
        </Text>
      </TouchableOpacity>
    </AuthLayout>
  );
}
