import React, { useState } from 'react';
import { Text, TouchableOpacity, View, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store/useAuthStore';
import { previewInvitation } from '../../services/organizations';
import { InvitationPreview, RootStackParamList } from '../../types';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthField from '../../components/auth/AuthField';
import AuthButton from '../../components/auth/AuthButton';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Mode = 'create' | 'join';

export default function RegisterScreen() {
  const [mode, setMode] = useState<Mode>('create');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Aperçu de l'invitation : confirme à la personne qu'elle rejoint la bonne
  // entreprise avant de saisir un mot de passe.
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [checking, setChecking] = useState(false);

  const register = useAuthStore((s) => s.register);
  const nav = useNavigation<Nav>();

  const checkCode = async () => {
    const token = code.trim();
    if (!token) return;
    setChecking(true);
    setPreview(null);
    try {
      const found = await previewInvitation(token);
      setPreview(found);
      // L'invitation est nominative : pré-remplir évite le refus du serveur.
      setEmail(found.email);
    } catch {
      Alert.alert(
        'Code invalide',
        'Cette invitation est inconnue, déjà utilisée ou expirée.',
      );
    } finally {
      setChecking(false);
    }
  };

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Champs manquants', 'Remplissez tous les champs.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Mot de passe trop court', 'Il faut au moins 6 caractères.');
      return;
    }
    if (mode === 'create' && !orgName.trim()) {
      Alert.alert(
        'Organisation manquante',
        'Indiquez le nom de votre entreprise ou équipe.',
      );
      return;
    }
    if (mode === 'join' && !code.trim()) {
      Alert.alert('Code manquant', 'Saisissez le code reçu par e-mail.');
      return;
    }

    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      await register(name, cleanEmail, password, {
        organizationName: mode === 'create' ? orgName.trim() : undefined,
        invitationToken: mode === 'join' ? code.trim() : undefined,
      });
      nav.navigate('OTP', { email: cleanEmail });
    } catch (err: any) {
      if (!err?.response) {
        Alert.alert('Erreur réseau', `Serveur injoignable.\n${err?.message ?? ''}`);
      } else {
        Alert.alert(
          'Erreur',
          err?.response?.data?.message || 'Inscription impossible',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Créer un compte" subtitle="TeamPulse pour votre équipe">
      {/* Sélecteur de mode */}
      <View className="flex-row bg-surface-chip dark:bg-dark-100 rounded-xl p-1 mb-5">
        {(
          [
            { key: 'create', label: 'Créer une organisation' },
            { key: 'join', label: 'Rejoindre' },
          ] as const
        ).map((m) => {
          const active = mode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              onPress={() => setMode(m.key)}
              activeOpacity={0.8}
              className={`flex-1 py-2.5 rounded-lg items-center ${
                active ? 'bg-primary-600' : ''
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  active ? 'text-white' : 'text-ink-700 dark:text-slate-200'
                }`}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {mode === 'create' ? (
        <AuthField
          placeholder="Nom de l'entreprise ou de l'équipe"
          value={orgName}
          onChangeText={setOrgName}
        />
      ) : (
        <>
          <View className="flex-row items-start">
            <View className="flex-1">
              <AuthField
                placeholder="Code d'invitation"
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setPreview(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                onBlur={checkCode}
              />
            </View>
            <TouchableOpacity
              onPress={checkCode}
              disabled={checking || !code.trim()}
              activeOpacity={0.8}
              className="bg-surface-chip dark:bg-dark-100 rounded-xl px-4 h-[54px] items-center justify-center ml-2"
            >
              {checking ? (
                <ActivityIndicator size="small" color="#16a34a" />
              ) : (
                <Text className="text-primary-600 dark:text-primary-400 font-semibold">
                  Vérifier
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {preview && (
            <View className="bg-primary-100 dark:bg-primary-900 rounded-xl px-4 py-3 mb-4">
              <Text className="text-primary-800 dark:text-primary-200 text-sm">
                Invitation à rejoindre{' '}
                <Text className="font-bold">{preview.organizationName}</Text>
                {preview.role === 'admin' ? ' en tant qu’administrateur' : ''}.
              </Text>
            </View>
          )}
        </>
      )}

      <AuthField
        placeholder="Nom complet"
        value={name}
        onChangeText={setName}
        autoComplete="name"
      />

      <AuthField
        placeholder="E-mail professionnel"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        // Imposée par l'invitation : la modifier ferait échouer l'inscription.
        editable={!(mode === 'join' && !!preview)}
      />

      <AuthField
        className="mb-6"
        placeholder="Mot de passe (6 caractères minimum)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <AuthButton
        label={mode === 'create' ? 'Créer l’organisation' : 'Rejoindre'}
        loadingLabel="Création…"
        loading={loading}
        onPress={handleRegister}
      />

      <TouchableOpacity className="items-center py-2" onPress={() => nav.goBack()}>
        <Text className="text-ink-500 dark:text-slate-400">
          Déjà un compte ?{' '}
          <Text className="text-primary-600 dark:text-primary-400 font-semibold">
            Se connecter
          </Text>
        </Text>
      </TouchableOpacity>
    </AuthLayout>
  );
}
