import { weatherEmoji } from '@/lib/weatherCodes';
import type { WeatherInfo } from '@/lib/types';

export default function WeatherCard({
  weather,
  locationLabel,
}: {
  weather: WeatherInfo | null;
  locationLabel?: string;
}) {
  if (!weather) {
    return (
      <div className="glass-card flex items-center gap-3 rounded-lg px-4 py-3.5">
        <div className="h-9 w-9 animate-pulse rounded-full bg-text/10" />
        <div className="flex-1">
          <div className="mb-1.5 h-3 w-24 animate-pulse rounded bg-text/10" />
          <div className="h-2.5 w-32 animate-pulse rounded bg-text/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card flex items-center gap-3 rounded-lg px-4 py-3.5">
      <span className="text-3xl leading-none">{weatherEmoji(weather.weatherCode)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-text">
          {Math.round(weather.minTemp)}° / {Math.round(weather.maxTemp)}℃・{weather.description}
        </p>
        <p className="truncate text-[11px] text-text-muted">
          {locationLabel ?? '現在地'} ・ 降水確率 {weather.precipitationProbability}%
        </p>
      </div>
    </div>
  );
}
