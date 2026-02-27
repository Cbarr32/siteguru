import { NextRequest, NextResponse } from "next/server";
import { cachedFetch } from "@/lib/redis";

interface WeatherResponse {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  description: string;
  icon: string;
  main: string;
  forecast?: {
    date: string;
    tempMin: number;
    tempMax: number;
    main: string;
    description: string;
    icon: string;
  }[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city") || "New York";
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey || apiKey === "your-openweather-api-key") {
    // Return mock data when no API key is configured
    return NextResponse.json(getMockWeather(city));
  }

  try {
    const data = await cachedFetch<WeatherResponse>(
      `weather:${city.toLowerCase()}`,
      async () => {
        // Current weather
        const currentRes = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=imperial`
        );
        if (!currentRes.ok) {
          throw new Error(`Weather API error: ${currentRes.statusText}`);
        }
        const current = await currentRes.json();

        // 5-day forecast
        const forecastRes = await fetch(
          `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=imperial`
        );
        let forecast: WeatherResponse["forecast"] = [];
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json();
          // Group by day and pick midday reading
          const dailyMap = new Map<string, typeof forecastData.list[0]>();
          for (const item of forecastData.list) {
            const date = new Date(item.dt * 1000).toLocaleDateString("en-US", {
              weekday: "short",
            });
            if (!dailyMap.has(date)) {
              dailyMap.set(date, item);
            }
          }
          forecast = Array.from(dailyMap.entries())
            .slice(0, 5)
            .map(([date, item]) => ({
              date,
              tempMin: item.main.temp_min,
              tempMax: item.main.temp_max,
              main: item.weather[0].main,
              description: item.weather[0].description,
              icon: item.weather[0].icon,
            }));
        }

        return {
          location: `${current.name}, ${current.sys.country}`,
          temperature: current.main.temp,
          feelsLike: current.main.feels_like,
          humidity: current.main.humidity,
          windSpeed: current.wind.speed,
          description: current.weather[0].description,
          icon: current.weather[0].icon,
          main: current.weather[0].main,
          forecast,
        };
      },
      600 // Cache for 10 minutes
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("Weather API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weather data" },
      { status: 500 }
    );
  }
}

function getMockWeather(city: string): WeatherResponse {
  return {
    location: city,
    temperature: 72,
    feelsLike: 70,
    humidity: 45,
    windSpeed: 8,
    description: "partly cloudy",
    icon: "02d",
    main: "Clouds",
    forecast: [
      { date: "Mon", tempMin: 65, tempMax: 75, main: "Clear", description: "clear sky", icon: "01d" },
      { date: "Tue", tempMin: 63, tempMax: 73, main: "Clouds", description: "scattered clouds", icon: "03d" },
      { date: "Wed", tempMin: 60, tempMax: 70, main: "Rain", description: "light rain", icon: "10d" },
      { date: "Thu", tempMin: 62, tempMax: 72, main: "Clouds", description: "broken clouds", icon: "04d" },
      { date: "Fri", tempMin: 66, tempMax: 76, main: "Clear", description: "clear sky", icon: "01d" },
    ],
  };
}
