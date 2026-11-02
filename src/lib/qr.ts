/**
 * QR code come stringa SVG. Il pacchetto `qrcode` viene caricato al volo (chunk separato, nessun peso nel bundle iniziale);
 * se il caricamento fallisce restituisce null e la UI mostra solo il link.
 */
export async function qrSvg(text: string): Promise<string | null> {
  try {
    const QR = await import('qrcode');
    return await QR.toString(text, { type: 'svg', margin: 1, width: 192 });
  } catch { return null; }
}
