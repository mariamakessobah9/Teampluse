import React from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { useColorScheme } from 'nativewind';

const BASE =
  'bg-surface-card dark:bg-dark-100 border border-ink-200 dark:border-transparent ' +
  'text-ink-900 dark:text-white rounded-xl px-4 py-4 mb-4 text-base';

/**
 * Champ de saisie suivant le theme. `placeholderTextColor` n'accepte pas de
 * classe utilitaire : il faut lui passer la couleur resolue a la main.
 */
export default function AuthField({
  className,
  ...props
}: TextInputProps & { className?: string }) {
  const { colorScheme } = useColorScheme();
  const placeholder = colorScheme === 'dark' ? '#64748b' : '#9ca3af';

  return (
    <TextInput
      placeholderTextColor={placeholder}
      // Concatene plutot que remplace : un appelant qui ajoute `tracking-widest`
      // ne doit pas perdre le fond ni la bordure.
      className={className ? `${BASE} ${className}` : BASE}
      {...props}
    />
  );
}
