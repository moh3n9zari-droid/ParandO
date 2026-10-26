/**
 * ابزارهای قالب‌بندی متون، اعداد و ارزهای سامانه ملی پاراندو (ریال و تومان)
 */

export function toPersianDigits(input: string | number): string {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(input).replace(/[0-9]/g, (w) => persianDigits[+w]);
}

export function formatRial(amount: number, usePersianDigits: boolean = true): string {
  const formatted = new Intl.NumberFormat('en-US').format(amount);
  const text = `${formatted} ریال`;
  return usePersianDigits ? toPersianDigits(text) : text;
}

export function formatToman(amount: number, usePersianDigits: boolean = true): string {
  const toman = Math.floor(amount / 10);
  const formatted = new Intl.NumberFormat('en-US').format(toman);
  const text = `${formatted} تومان`;
  return usePersianDigits ? toPersianDigits(text) : text;
}

export function formatDualCurrency(amount: number): { rial: string; toman: string } {
  return {
    rial: formatRial(amount, true),
    toman: formatToman(amount, true),
  };
}

export function formatTimestamp(date: Date): string {
  return toPersianDigits(
    date.toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  );
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return toPersianDigits('۰۰:۰۰:۰۰');
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return toPersianDigits(timeStr);
}
