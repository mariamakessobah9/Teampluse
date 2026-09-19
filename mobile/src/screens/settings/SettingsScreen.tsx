import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OrgRole, RootStackParamList } from '../../types';
import { useColorScheme } from 'nativewind';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfileAvatar from '../../components/ProfileAvatar';
import Logo from '../../components/Logo';
import { uploadToCloudinary } from '../../services/upload';

/**
 * Renseignées au moment du build. Les entrées correspondantes n'apparaissent
 * que si l'URL existe : mieux vaut une ligne en moins qu'un bouton inerte.
 */
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Responsable',
  admin: 'Administrateur',
  member: 'Membre',
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const openPhoneModal = () => {
    setPhoneInput(user?.phone || '');
    setPhoneModalOpen(true);
  };

  const openNameModal = () => {
    setNameInput(user?.name || '');
    setNameModalOpen(true);
  };

  const handleSaveName = async () => {
    const name = nameInput.trim();
    if (!name) {
      Alert.alert('Nom requis', 'Saisissez votre nom.');
      return;
    }
    setSavingName(true);
    try {
      await updateProfile({ name });
      setNameModalOpen(false);
    } catch (e: any) {
      Alert.alert(
        'Échec',
        e?.response?.data?.message || 'Veuillez réessayer.',
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleSavePhone = async () => {
    setSavingPhone(true);
    try {
      await updateProfile({ phone: phoneInput.trim() });
      setPhoneModalOpen(false);
    } catch (e: any) {
      Alert.alert('Échec', e?.message || 'Veuillez réessayer.');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleChangeAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Autorisation requise', 'Autorisez l’accès à vos photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadToCloudinary({
        uri: asset.uri,
        name: asset.fileName || `avatar-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        folder: 'avatars',
        resourceType: 'image',
      });
      await updateProfile({ avatar: uploaded.url });
    } catch (e: any) {
      Alert.alert('Envoi impossible', e?.message || 'Veuillez réessayer.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const iconColor = isDark ? '#e5e7eb' : '#1f2937';
  const headerAccent = isDark ? '#86efac' : '#15803d';
  const mutedIcon = isDark ? '#94a3b8' : '#4b5563';

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      Alert.alert('Mot de passe requis', 'Confirmez avec votre mot de passe.');
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      // Pas de navigation à faire : la déconnexion renvoie RootNavigator sur
      // le parcours d'authentification.
    } catch (e: any) {
      Alert.alert(
        'Suppression impossible',
        e?.response?.data?.message || 'Veuillez réessayer.',
      );
    } finally {
      setDeleting(false);
      setDeletePassword('');
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Supprimer mon compte',
      `Votre nom, votre e-mail, votre photo et votre téléphone seront effacés définitivement, et vous perdrez l’accès à l’application.

Les messages déjà envoyés restent dans les conversations de vos collègues, attribués à « Compte supprimé ».`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          style: 'destructive',
          onPress: () => {
            setDeletePassword('');
            setDeleteOpen(true);
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      {/* Top header */}
      <View className="bg-surface-header dark:bg-dark-300 pb-3 px-4 flex-row items-center justify-between" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center">
          <View className="mr-3">
            <Logo size={32} />
          </View>
          <Text className="text-primary-700 dark:text-primary-300 text-xl font-bold">
            TeamPulse
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => nav.navigate('Search')}
        >
          <Ionicons name="search" size={22} color={headerAccent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
        {/* Profile */}
        <View className="items-center mt-6 mb-4">
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleChangeAvatar}
            disabled={uploadingAvatar}
          >
            <View className="relative">
              <ProfileAvatar uri={user?.avatar} name={user?.name}>
                {uploadingAvatar && (
                  <View className="absolute inset-0 bg-black/40 items-center justify-center">
                    <ActivityIndicator color="#ffffff" />
                  </View>
                )}
              </ProfileAvatar>
              <View className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-primary-600 items-center justify-center border-2 border-surface-page dark:border-dark-200">
                <Ionicons name="camera" size={14} color="#ffffff" />
              </View>
            </View>
          </TouchableOpacity>
          <Text className="text-ink-900 dark:text-white text-2xl font-bold mt-4">
            {user?.name || 'Sans nom'}
          </Text>
          <Text className="text-ink-400 dark:text-slate-400 text-sm mt-1">
            {ROLE_LABEL[(user?.role ?? 'member') as OrgRole] ?? 'Membre'}
          </Text>
        </View>

        {/* Contact info card */}
        <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl p-4 mb-4">
          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-full bg-surface-chip dark:bg-dark-200 items-center justify-center mr-3">
              <Ionicons name="mail" size={18} color={mutedIcon} />
            </View>
            <View className="flex-1">
              <Text className="text-ink-400 dark:text-slate-400 text-xs font-semibold tracking-wider">
                ADRESSE E-MAIL
              </Text>
              <Text className="text-ink-900 dark:text-white text-base font-semibold mt-0.5">
                {user?.email || '—'}
              </Text>
            </View>
          </View>
          <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 my-3" />
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={openPhoneModal}
            className="flex-row items-center"
          >
            <View className="w-10 h-10 rounded-full bg-surface-chip dark:bg-dark-200 items-center justify-center mr-3">
              <Ionicons name="call" size={18} color={mutedIcon} />
            </View>
            <View className="flex-1">
              <Text className="text-ink-400 dark:text-slate-400 text-xs font-semibold tracking-wider">
                NUMÉRO DE TÉLÉPHONE
              </Text>
              <Text
                className={`text-base font-semibold mt-0.5 ${
                  user?.phone
                    ? 'text-ink-900 dark:text-white'
                    : 'text-ink-400 dark:text-slate-400'
                }`}
              >
                {user?.phone || 'Appuyez pour ajouter'}
              </Text>
            </View>
            <Ionicons name="pencil" size={16} color={mutedIcon} />
          </TouchableOpacity>
        </View>

        {/* « Partager le profil » a ete retire : sans lien profond ni page web,
            il n'y avait rien a partager. */}
        <View className="mx-4 mb-6">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={openNameModal}
            className="bg-primary-600 rounded-2xl py-3 flex-row items-center justify-center"
          >
            <Ionicons name="create-outline" size={18} color="#ffffff" />
            <Text className="text-white font-semibold ml-2">
              Modifier mon nom
            </Text>
          </TouchableOpacity>
        </View>

        {/* Appearance */}
        <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-6 mb-2">
          APPARENCE
        </Text>
        <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl p-2 mb-4 flex-row">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setTheme('light')}
            className={`flex-1 flex-row items-center justify-center py-2.5 rounded-xl ${
              theme === 'light' ? 'bg-primary-600' : ''
            }`}
          >
            <Ionicons
              name="sunny-outline"
              size={18}
              color={theme === 'light' ? '#ffffff' : mutedIcon}
            />
            <Text
              className={`font-semibold ml-2 ${
                theme === 'light'
                  ? 'text-white'
                  : 'text-ink-700 dark:text-slate-200'
              }`}
            >
              Clair
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setTheme('dark')}
            className={`flex-1 flex-row items-center justify-center py-2.5 rounded-xl ${
              theme === 'dark' ? 'bg-primary-600' : ''
            }`}
          >
            <Ionicons
              name="moon-outline"
              size={18}
              color={theme === 'dark' ? '#ffffff' : mutedIcon}
            />
            <Text
              className={`font-semibold ml-2 ${
                theme === 'dark'
                  ? 'text-white'
                  : 'text-ink-700 dark:text-slate-200'
              }`}
            >
              Sombre
            </Text>
          </TouchableOpacity>
        </View>

        {/* Organisation */}
        <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-6 mb-2">
          ESPACE DE TRAVAIL
        </Text>
        <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl overflow-hidden mb-4">
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => nav.navigate('Organization')}
            className="flex-row items-center px-4 py-4"
          >
            <Ionicons name="business-outline" size={20} color={iconColor} />
            <View className="flex-1 ml-3">
              <Text className="text-ink-900 dark:text-white text-base font-medium">
                Organisation
              </Text>
              <Text className="text-ink-400 dark:text-slate-400 text-xs mt-0.5">
                {user?.role === 'owner' || user?.role === 'admin'
                  ? 'Membres, rôles et invitations'
                  : 'Annuaire de votre équipe'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Account settings */}
        <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-6 mb-2">
          PARAMÈTRES DU COMPTE
        </Text>
        <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl overflow-hidden mb-4">
          {PRIVACY_URL && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => Linking.openURL(PRIVACY_URL)}
              className="flex-row items-center px-4 py-4"
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={iconColor}
              />
              <Text className="text-ink-900 dark:text-white text-base font-medium flex-1 ml-3">
                Politique de confidentialité
              </Text>
              <Ionicons name="open-outline" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
          {SUPPORT_EMAIL && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              className={`flex-row items-center px-4 py-4 ${
                PRIVACY_URL
                  ? 'border-t border-ink-200/40 dark:border-slate-700/50'
                  : ''
              }`}
            >
              <Ionicons
                name="help-circle-outline"
                size={20}
                color={iconColor}
              />
              <Text className="text-ink-900 dark:text-white text-base font-medium flex-1 ml-3">
                Aide et support
              </Text>
              <Ionicons name="open-outline" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleLogout}
            className={`flex-row items-center px-4 py-4 ${
              PRIVACY_URL || SUPPORT_EMAIL
                ? 'border-t border-ink-200/40 dark:border-slate-700/50'
                : ''
            }`}
          >
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            <Text className="text-red-600 dark:text-red-400 text-base font-semibold ml-3">
              Se déconnecter
            </Text>
          </TouchableOpacity>
        </View>

        {/* Suppression de compte — exigée par Google Play dès lors que
            l'application permet d'en créer un. */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={confirmDelete}
          className="mx-4 flex-row items-center justify-center py-3"
        >
          <Ionicons name="trash-outline" size={16} color={mutedIcon} />
          <Text className="text-ink-400 dark:text-slate-400 text-sm ml-2">
            Supprimer mon compte
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Nom */}
      <Modal
        visible={nameModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNameModalOpen(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="bg-surface-card dark:bg-dark-300 rounded-2xl w-full p-5">
            <Text className="text-ink-900 dark:text-white font-bold text-lg mb-1">
              Votre nom
            </Text>
            <Text className="text-ink-400 dark:text-slate-400 text-sm mb-4">
              Il est visible par les membres de votre organisation.
            </Text>
            <TextInput
              className="bg-surface-chip dark:bg-dark-100 text-ink-900 dark:text-white rounded-2xl px-4 py-3 text-base"
              placeholder="Prénom et nom"
              placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
              value={nameInput}
              onChangeText={setNameInput}
              maxLength={60}
              autoFocus
            />
            <View className="flex-row justify-end mt-5">
              <TouchableOpacity
                onPress={() => setNameModalOpen(false)}
                className="px-4 py-2.5 mr-2"
              >
                <Text className="text-ink-500 dark:text-slate-300 font-semibold">
                  Annuler
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveName}
                disabled={savingName}
                activeOpacity={0.85}
                className="bg-primary-600 rounded-full px-5 py-2.5 items-center justify-center"
              >
                {savingName ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text className="text-white font-bold">Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation de suppression */}
      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteOpen(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="bg-surface-card dark:bg-dark-300 rounded-2xl w-full p-5">
            <Text className="text-ink-900 dark:text-white font-bold text-lg mb-1">
              Confirmer la suppression
            </Text>
            <Text className="text-ink-400 dark:text-slate-400 text-sm mb-4">
              Saisissez votre mot de passe. Cette action est irréversible.
            </Text>
            <TextInput
              className="bg-surface-chip dark:bg-dark-100 text-ink-900 dark:text-white rounded-2xl px-4 py-3 text-base"
              placeholder="Mot de passe"
              placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoFocus
            />
            <View className="flex-row justify-end mt-5">
              <TouchableOpacity
                onPress={() => setDeleteOpen(false)}
                className="px-4 py-2.5 mr-2"
              >
                <Text className="text-ink-500 dark:text-slate-300 font-semibold">
                  Annuler
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteAccount}
                disabled={deleting}
                activeOpacity={0.85}
                className="bg-red-600 rounded-full px-5 py-2.5 items-center justify-center"
              >
                {deleting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text className="text-white font-bold">Supprimer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Phone number edit modal */}
      <Modal
        visible={phoneModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPhoneModalOpen(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="bg-surface-card dark:bg-dark-300 rounded-2xl w-full p-5">
            <Text className="text-ink-900 dark:text-white font-bold text-lg mb-1">
              Numéro de téléphone
            </Text>
            <Text className="text-ink-400 dark:text-slate-400 text-sm mb-4">
              Ajoutez ou modifiez votre numéro de téléphone.
            </Text>
            <TextInput
              className="bg-surface-chip dark:bg-dark-100 text-ink-900 dark:text-white rounded-2xl px-4 py-3 text-base"
              placeholder="e.g. +225 07 00 00 00 00"
              placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
              value={phoneInput}
              onChangeText={setPhoneInput}
              keyboardType="phone-pad"
              maxLength={25}
              autoFocus
            />
            <View className="flex-row justify-end mt-5">
              <TouchableOpacity
                onPress={() => setPhoneModalOpen(false)}
                className="px-4 py-2.5 mr-2"
              >
                <Text className="text-ink-500 dark:text-slate-300 font-semibold">
                  Annuler
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSavePhone}
                disabled={savingPhone}
                activeOpacity={0.85}
                className="bg-primary-600 rounded-full px-5 py-2.5 items-center justify-center"
              >
                {savingPhone ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text className="text-white font-bold">Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
