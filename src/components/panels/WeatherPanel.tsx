"use client";

import React, { useEffect, useState, useCallback } from "react";
import { BasePanel } from "@/components/panels/BasePanel";
import {
  Cloud,
  CloudRain,
  CloudSnow,
  Sun,
  CloudLightning,
  CloudDrizzle,
  CloudFog,
  Wind,
  Droplets,
  Thermometer,
  MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface WeatherData {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  description: string;
  icon: string;
  main: string;
  forecast?: ForecastDay[];
}

interface ForecastDay {
  date: string;
  tempMin: number;
  tempMax: number;
  main: string;
  description: string;
  icon: string;
}

function getWeatherIcon(main: string, size: string = "h-8 w-8") {
  const iconMap: Record<string, React.ReactNode> = {
    Clear: <Sun className={`${size} text-yellow-500`} />,
    Clouds: <Cloud className={`${size} text-gray-400`} />,
    Rain: <CloudRain className={`${size} text-blue-500`} />,
    Drizzle: <CloudDrizzle className={`${size} text-blue-400`} />,
    Thunderstorm: <CloudLightning className={`${size} text-purple-500`} />,
    Snow: <CloudSnow className={`${size} text-blue-200`} />,
    Mist: <CloudFog className={`${size} text-gray-300`} />,
    Fog: <CloudFog className={`${size} text-gray-300`} />,
    Haze: <CloudFog className={`${size} text-gray-300`} />,
  };
  return iconMap[main] || <Cloud className={`${size} text-gray-400`} />;
}

interface WeatherPanelProps {
  id: string;
  onRemove?: (id: string) => void;
  onToggleExpand?: (id: string) => void;
  isExpanded?: boolean;
  defaultCity?: string;
}

export function WeatherPanel({
  id,
  onRemove,
  onToggleExpand,
  isExpanded = false,
  defaultCity = "New York",
}: WeatherPanelProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState(defaultCity);
  const [searchInput, setSearchInput] = useState(defaultCity);

  const fetchWeather = useCallback(async (cityName: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/weather?city=${encodeURIComponent(cityName)}`
      );
      if (!res.ok) {
        throw new Error("Failed to fetch weather data");
      }
      const data = await res.json();
      setWeather(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching weather");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather(city);
    // Refresh every 10 minutes
    const interval = setInterval(() => fetchWeather(city), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [city, fetchWeather]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setCity(searchInput.trim());
    }
  };

  return (
    <BasePanel
      id={id}
      title="Weather"
      icon={<Cloud className="h-4 w-4" />}
      isLoading={loading}
      isExpanded={isExpanded}
      onRemove={onRemove}
      onToggleExpand={onToggleExpand}
      onRefresh={() => fetchWeather(city)}
    >
      <div className="flex flex-col gap-3 h-full">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search city..."
            className="h-8 text-xs"
          />
          <Button type="submit" size="sm" className="h-8 px-3 text-xs">
            <MapPin className="h-3 w-3" />
          </Button>
        </form>

        {error ? (
          <div className="flex items-center justify-center flex-1 text-sm text-destructive">
            {error}
          </div>
        ) : weather ? (
          <>
            {/* Current weather */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {weather.location}
                </div>
                <div className="text-3xl font-bold">
                  {Math.round(weather.temperature)}°F
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {weather.description}
                </div>
              </div>
              <div>{getWeatherIcon(weather.main, "h-12 w-12")}</div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Thermometer className="h-3 w-3" />
                <span>Feels {Math.round(weather.feelsLike)}°</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Droplets className="h-3 w-3" />
                <span>{weather.humidity}%</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Wind className="h-3 w-3" />
                <span>{Math.round(weather.windSpeed)} mph</span>
              </div>
            </div>

            {/* Forecast */}
            {weather.forecast && weather.forecast.length > 0 && (
              <div className="mt-1 border-t pt-2">
                <div className="text-xs font-medium mb-1.5">5-Day Forecast</div>
                <div className="grid grid-cols-5 gap-1">
                  {weather.forecast.slice(0, 5).map((day) => (
                    <div
                      key={day.date}
                      className="flex flex-col items-center gap-0.5 text-xs"
                    >
                      <span className="text-muted-foreground">{day.date}</span>
                      {getWeatherIcon(day.main, "h-4 w-4")}
                      <div className="flex gap-0.5">
                        <span className="font-medium">
                          {Math.round(day.tempMax)}°
                        </span>
                        <span className="text-muted-foreground">
                          {Math.round(day.tempMin)}°
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </BasePanel>
  );
}
