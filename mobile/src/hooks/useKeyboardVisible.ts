import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Vrai tant que le clavier est ouvert.
 *
 * L'application est en « edge-to-edge » sur Android : l'écran se prolonge
 * sous la barre de navigation du téléphone (boutons ou geste). On réserve
 * donc cette hauteur sous les boutons du bas — mais seulement clavier fermé :
 * clavier ouvert, il recouvre déjà cette barre, et la marge en plus ferait
 * flotter la saisie au-dessus du clavier.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // iOS annonce le clavier avant l'animation ; Android seulement après.
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
