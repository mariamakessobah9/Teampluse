import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

/**
 * Bouton principal des ecrans d'authentification. Affiche un indicateur
 * pendant l'attente reseau : le simple changement de libelle ne se voyait pas
 * assez, et l'utilisateur appuyait plusieurs fois.
 */
export default function AuthButton({
  label,
  loadingLabel,
  loading = false,
  onPress,
}: {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className={`rounded-xl py-4 items-center mb-4 ${
        loading ? 'bg-primary-700' : 'bg-primary-600'
      }`}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={loading}
      style={{
        shadowColor: '#16a34a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: loading ? 0 : 0.25,
        shadowRadius: 6,
        elevation: loading ? 0 : 3,
      }}
    >
      <View className="flex-row items-center">
        {loading && (
          <ActivityIndicator
            size="small"
            color="#ffffff"
            style={{ marginRight: 8 }}
          />
        )}
        <Text className="text-white font-bold text-base">
          {loading ? loadingLabel ?? label : label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
