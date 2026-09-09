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
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { uploadToCloudinary } from '../../services/upload';

const MENU_ITEMS = [
  { label: 'Notifications', icon: 'notifications-outline' as const },
  { label: 'Privacy & Security', icon: 'lock-closed-outline' as const },
  { label: 'Storage & Data', icon: 'server-outline' as const },
  { label: 'Help & Support', icon: 'help-circle-outline' as const },
];

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const openPhoneModal = () => {
    setPhoneInput(user?.phone || '');
    setPhoneModalOpen(true);
  };

  const handleSavePhone = async () => {
    setSavingPhone(true);
    try {
      await updateProfile({ phone: phoneInput.trim() });
      setPhoneModalOpen(false);
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Please try again.');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleChangeAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow access to your photos.');
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
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const iconColor = isDark ? '#e5e7eb' : '#1f2937';
  const headerAccent = isDark ? '#86efac' : '#15803d';
  const mutedIcon = isDark ? '#94a3b8' : '#4b5563';

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      {/* Top header */}
      <View className="bg-surface-header dark:bg-dark-300 pt-14 pb-3 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-primary-500 items-center justify-center mr-3">
            <Text className="text-white text-xs font-bold">{initials}</Text>
          </View>
          <Text className="text-primary-700 dark:text-primary-300 text-xl font-bold">
            TeamPulse
          </Text>
        </View>
        <TouchableOpacity>
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
              <View className="w-28 h-28 rounded-full border-[3px] border-primary-500 items-center justify-center bg-primary-100 dark:bg-primary-900 overflow-hidden">
                {user?.avatar ? (
                  <Image
                    source={{ uri: user.avatar }}
                    className="w-28 h-28 rounded-full"
                    cachePolicy="memory-disk"
                    transition={120}
                  />
                ) : (
                  <Text className="text-primary-700 dark:text-primary-300 text-3xl font-bold">
                    {initials}
                  </Text>
                )}
                {uploadingAvatar && (
                  <View className="absolute inset-0 bg-black/40 items-center justify-center">
                    <ActivityIndicator color="#ffffff" />
                  </View>
                )}
              </View>
              <View className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-primary-600 items-center justify-center border-2 border-surface-page dark:border-dark-200">
                <Ionicons name="camera" size={14} color="#ffffff" />
              </View>
            </View>
          </TouchableOpacity>
          <Text className="text-ink-900 dark:text-white text-2xl font-bold mt-4">
            {user?.name || 'Unknown'}
          </Text>
          <Text className="text-ink-400 dark:text-slate-400 text-sm mt-1">
            {user?.role
              ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
              : 'Member'}
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
                EMAIL ADDRESS
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
                PHONE NUMBER
              </Text>
              <Text
                className={`text-base font-semibold mt-0.5 ${
                  user?.phone
                    ? 'text-ink-900 dark:text-white'
                    : 'text-ink-400 dark:text-slate-400'
                }`}
              >
                {user?.phone || 'Tap to add'}
              </Text>
            </View>
            <Ionicons name="pencil" size={16} color={mutedIcon} />
          </TouchableOpacity>
        </View>

        {/* Action buttons */}
        <View className="flex-row mx-4 mb-6">
          <TouchableOpacity
            activeOpacity={0.85}
            className="flex-1 bg-primary-600 rounded-2xl py-3 mr-2 flex-row items-center justify-center"
          >
            <Ionicons name="create-outline" size={18} color="#ffffff" />
            <Text className="text-white font-semibold ml-2">Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            className="flex-1 bg-primary-100 dark:bg-primary-900 rounded-2xl py-3 ml-2 flex-row items-center justify-center"
          >
            <Ionicons name="share-social-outline" size={18} color={headerAccent} />
            <Text className="text-primary-700 dark:text-primary-300 font-semibold ml-2">
              Share Profile
            </Text>
          </TouchableOpacity>
        </View>

        {/* Appearance */}
        <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-6 mb-2">
          APPEARANCE
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
              Light
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
              Dark
            </Text>
          </TouchableOpacity>
        </View>

        {/* Account settings */}
        <Text className="text-ink-400 dark:text-slate-400 text-xs font-bold tracking-wider mx-6 mb-2">
          ACCOUNT SETTINGS
        </Text>
        <View className="mx-4 bg-surface-card dark:bg-dark-100 rounded-2xl overflow-hidden mb-4">
          {MENU_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              activeOpacity={0.7}
              className={`flex-row items-center px-4 py-4 ${
                i > 0 ? 'border-t border-ink-200/40 dark:border-slate-700/50' : ''
              }`}
            >
              <Ionicons name={item.icon} size={20} color={iconColor} />
              <Text className="text-ink-900 dark:text-white text-base font-medium flex-1 ml-3">
                {item.label}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleLogout}
            className="flex-row items-center px-4 py-4 border-t border-ink-200/40 dark:border-slate-700/50"
          >
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            <Text className="text-red-600 dark:text-red-400 text-base font-semibold ml-3">
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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
              Phone number
            </Text>
            <Text className="text-ink-400 dark:text-slate-400 text-sm mb-4">
              Add or update your phone number.
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
                  Cancel
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
                  <Text className="text-white font-bold">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
