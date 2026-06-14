export interface WeatherData {
  temperature: number;
  conditionCode: number;
  isDay: boolean;
}

export interface AppState {
  alarmTime: string; // "HH:MM" 24h format
  isAlarmActive: boolean;
  agenda: string;
  location: string | null;
  weather: WeatherData | null;
  status: 'idle' | 'generating_prompt' | 'generating_music' | 'ready' | 'playing' | 'error';
  errorMessage: string | null;
  audioSrc: string | null;
  lyrics: string;
  logs: string[];
}

export const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  95: "Thunderstorm",
};