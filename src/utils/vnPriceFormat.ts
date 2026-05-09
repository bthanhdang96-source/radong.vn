export function formatVnPrice(value: number): string {
  return Math.round(value).toLocaleString('vi-VN');
}

export function formatSignedVnPrice(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatVnPrice(value)}`;
}
