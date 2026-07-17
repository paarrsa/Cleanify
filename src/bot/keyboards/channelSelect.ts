import { InlineKeyboard } from 'grammy';

export interface SelectableChannel {
  id: number;
  label: string;
}

export function channelSelectKeyboard(channels: SelectableChannel[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const channel of channels) {
    keyboard.text(channel.label, `autocleanup:channel:${channel.id}`).row();
  }
  return keyboard;
}
