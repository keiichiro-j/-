export const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: '快晴',
  1: 'ほぼ晴れ',
  2: '晴れ時々くもり',
  3: 'くもり',
  45: '霧',
  48: '霧氷',
  51: '小雨',
  53: '雨',
  55: '強い霧雨',
  56: '着氷性の霧雨',
  57: '強い着氷性の霧雨',
  61: '小雨',
  63: '雨',
  65: '大雨',
  66: '着氷性の雨',
  67: '強い着氷性の雨',
  71: '小雪',
  73: '雪',
  75: '大雪',
  77: '雪粒',
  80: 'にわか雨',
  81: '強いにわか雨',
  82: '激しいにわか雨',
  85: 'にわか雪',
  86: '激しいにわか雪',
  95: '雷雨',
  96: '雷雨（ひょう混じり）',
  99: '雷雨（激しいひょう）',
};

export function isRainCode(code: number): boolean {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  );
}

export function isSnowCode(code: number): boolean {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

export function weatherDescription(code: number): string {
  return WEATHER_CODE_DESCRIPTIONS[code] ?? 'くもり';
}

export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 95) return '⛈️';
  if (isSnowCode(code)) return '❄️';
  if (isRainCode(code)) return '🌧️';
  return '☁️';
}
