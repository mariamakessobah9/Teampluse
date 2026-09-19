import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import Logo from '../Logo';

/**
 * Cadre commun aux ecrans d'authentification. Les cinq ecrans repetaient le
 * meme KeyboardAvoidingView avec un fond sombre code en dur, alors que l'app
 * demarre en theme clair : l'utilisateur voyait un ecran noir avant de
 * basculer sur du blanc une fois connecte.
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-surface-page dark:bg-dark-200"
    >
      {/* Le clavier recouvre les champs du bas sur les petits ecrans une fois
          le formulaire centre : le defilement garde le bouton atteignable. */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-8 py-10">
          <View className="mb-6">
            <Logo size={64} />
          </View>
          <Text className="text-3xl font-bold text-ink-900 dark:text-white mb-2">
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-ink-500 dark:text-slate-400 text-base mb-8">
              {subtitle}
            </Text>
          ) : null}
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
