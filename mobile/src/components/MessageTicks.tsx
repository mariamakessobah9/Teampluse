import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Message } from '../types';

/** Bleu des messages lus, repris de WhatsApp. */
export const READ_TICK_COLOR = '#53bdeb';

/**
 * Accusés de réception : ✓ envoyé, ✓✓ remis, ✓✓ bleu lu.
 * `color` est la teinte des états non lus, qui dépend du fond.
 */
export default function MessageTicks({
  status,
  color,
  size = 14,
}: {
  status: Message['status'];
  color: string;
  size?: number;
}) {
  return (
    <Ionicons
      name={status === 'sent' ? 'checkmark' : 'checkmark-done'}
      size={size}
      color={status === 'read' ? READ_TICK_COLOR : color}
    />
  );
}
