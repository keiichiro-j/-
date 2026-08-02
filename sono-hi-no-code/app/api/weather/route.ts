import { NextRequest, NextResponse } from 'next/server';
import { isRainCode, weatherDescription } from '@/lib/weatherCodes';
import type { WeatherInfo } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DEFAULT_LAT = 35.6812;
const DEFAULT_LON = 139.7671;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat') ?? DEFAULT_LAT);
  const lon = Number(searchParams.get('lon') ?? DEFAULT_LON);

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,precipitation,weather_code');
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code'
  );
  url.searchParams.set('timezone', 'auto');

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`open-meteo error: ${res.status}`);
    const data = await res.json();

    const code: number = data.daily?.weather_code?.[0] ?? data.current?.weather_code ?? 3;
    const info: WeatherInfo = {
      temperature: data.current?.temperature_2m ?? 20,
      precipitationProbability: data.daily?.precipitation_probability_max?.[0] ?? 0,
      weatherCode: code,
      description: weatherDescription(code),
      isRain: isRainCode(code),
      minTemp: data.daily?.temperature_2m_min?.[0] ?? data.current?.temperature_2m ?? 15,
      maxTemp: data.daily?.temperature_2m_max?.[0] ?? data.current?.temperature_2m ?? 22,
    };
    return NextResponse.json(info);
  } catch {
    const fallback: WeatherInfo = {
      temperature: 20,
      precipitationProbability: 10,
      weatherCode: 2,
      description: '晴れ時々くもり（取得失敗のため推定値）',
      isRain: false,
      minTemp: 16,
      maxTemp: 23,
    };
    return NextResponse.json(fallback);
  }
}
