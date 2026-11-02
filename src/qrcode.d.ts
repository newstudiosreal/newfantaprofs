// Tipi minimi per `qrcode` (evita di richiedere anche @types/qrcode).
declare module 'qrcode' {
  export function toString(text: string, options?: { type?: 'svg' | 'utf8' | 'terminal'; margin?: number; width?: number }): Promise<string>;
}
