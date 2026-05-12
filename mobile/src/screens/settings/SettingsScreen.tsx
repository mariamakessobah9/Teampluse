import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useAuthStore } from '../../store/useAuthStore';

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View className="flex-1 bg-dark-200">
      <View className="px-4 pt-14 pb-4">
        <Text className="text-white text-2xl font-bold">Settings</Text>
      </View>

      {/* Profile Card */}
      <View className="mx-4 bg-dark-100 rounded-2xl p-4 mb-6">
        <View className="w-16 h-16 rounded-full bg-primary-800 items-center justify-center mb-3">
          <Text className="text-white text-2xl font-bold">
            {user?.name?.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <Text className="text-white text-xl font-bold">{user?.name}</Text>
        <Text className="text-slate-400 text-sm mt-1">{user?.email}</Text>
      </View>

      {/* Menu Items */}
      <View className="mx-4 bg-dark-100 rounded-2xl overflow-hidden mb-6">
        {['Notifications', 'Privacy & Security', 'Storage & Data', 'Help & Support'].map(
          (item, i) => (
            <TouchableOpacity
              key={item}
              className={`flex-row items-center justify-between px-4 py-4 ${
                i > 0 ? 'border-t border-dark-200' : ''
              }`}
            >
              <Text className="text-white text-base">{item}</Text>
              <Text className="text-slate-500">→</Text>
            </TouchableOpacity>
          ),
        )}
      </View>

      {/* Logout */}
      <TouchableOpacity
        className="mx-4 bg-red-900/30 rounded-2xl py-4 items-center"
        onPress={handleLogout}
      >
        <Text className="text-red-400 font-semibold text-base">Logout</Text>
      </TouchableOpacity>
    </View>
  );
}
