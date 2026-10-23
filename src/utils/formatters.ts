export function formatRial(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount) + ' IRR';
}

export function formatToman(amount: number): string {
  const toman = Math.floor(amount / 10);
  return new Intl.NumberFormat('en-US').format(toman) + ' Toman';
}

export function formatDualCurrency(amount: number): { rial: string; toman: string } {
  return {
    rial: formatRial(amount),
    toman: formatToman(amount),
  };
}

export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
