import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useAuthStore } from '../../store/useAuthStore';
import { RootStackParamList } from '../../types';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthField from '../../components/auth/AuthField';
import AuthButton from '../../components/auth/AuthButton';

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
      Alert.alert('Code incomplet', 'Saisissez les 6 chiffres reçus.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Mot de passe trop court', 'Il faut au moins 6 caractères.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email, otp, password);
    } catch (err: any) {
      Alert.alert(
        'Erreur',
        err?.response?.data?.message || 'Réinitialisation impossible',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Nouveau mot de passe"
      subtitle={`Saisissez le code à 6 chiffres envoyé à ${email}, puis choisissez un nouveau mot de passe.`}
    >
      <AuthField
        className="tracking-widest"
        placeholder="Code à 6 chiffres"
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
        maxLength={6}
      />

      <AuthField
        className="mb-6"
        placeholder="Nouveau mot de passe (6 caractères minimum)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <AuthButton
        label="Réinitialiser"
        loadingLabel="Réinitialisation…"
        loading={loading}
        onPress={handleSubmit}
      />
    </AuthLayout>
  );
}
