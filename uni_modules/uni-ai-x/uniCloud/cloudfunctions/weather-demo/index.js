'use strict'

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

function describeWeather(code) {
	if (code === 0) return '晴'
	if (code >= 1 && code <= 3) return '多云'
	if (code === 45 || code === 48) return '有雾'
	if (code >= 51 && code <= 57) return '毛毛雨'
	if (code >= 61 && code <= 67) return '下雨'
	if (code >= 71 && code <= 77) return '下雪'
	if (code >= 80 && code <= 82) return '阵雨'
	if (code === 85 || code === 86) return '阵雪'
	if (code >= 95 && code <= 99) return '雷雨'
	return '未知'
}

async function getJson(url, trace) {
	trace.url = url
	trace.status = null
	trace.responseBody = null
	const response = await uniCloud.httpclient.request(url, { dataType: 'json', timeout: 10000 })
	trace.status = response.status
	trace.responseBody = response.data
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`天气服务请求失败（HTTP ${response.status}）`)
	}
	if (response.data?.error) throw new Error(response.data.reason || '天气服务请求失败')
	return response.data || {}
}

exports.main = async (event) => {
	const city = typeof event?.city === 'string' ? event.city.trim() : ''
	if (!city || city.length > 80) {
		console.error('[weather-demo] invalid city', JSON.stringify({ city: event?.city }))
		return { error: 'city 必须是 1 到 80 字的城市名称', code: 'invalid_city' }
	}

	let stage = 'geocoding'
	const trace = { url: '', status: null, responseBody: null }
	try {
		const locations = await getJson(`${GEOCODING_URL}?${new URLSearchParams({ name: city, count: '5', language: 'zh', format: 'json' })}`, trace)
		if (!locations || (!Array.isArray(locations.results) && !(locations.results == null && typeof locations.generationtime_ms === 'number'))) {
			throw new Error('城市查询服务返回的数据不完整')
		}
		const location = locations.results?.[0]
		if (!location) {
			console.error('[weather-demo] city not found', JSON.stringify({ city, stage, ...trace }))
			return { error: `未找到“${city}”对应的城市，请提供更明确的地名`, code: 'city_not_found', stage, diagnostics: trace }
		}
		if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number' || typeof location.name !== 'string') {
			throw new Error('城市查询服务返回的数据不完整')
		}

		const params = new URLSearchParams({
			latitude: String(location.latitude),
			longitude: String(location.longitude),
			current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
			daily: 'temperature_2m_max,temperature_2m_min',
			timezone: location.timezone || 'auto',
			forecast_days: '1'
		})
		stage = 'forecast'
		const forecast = await getJson(`${FORECAST_URL}?${params}`, trace)
		const current = forecast.current
		if (!current || !current.time || typeof current.temperature_2m !== 'number'
			|| typeof current.weather_code !== 'number'
			|| typeof forecast.daily?.temperature_2m_max?.[0] !== 'number'
			|| typeof forecast.daily?.temperature_2m_min?.[0] !== 'number') {
			throw new Error('天气服务返回的数据不完整')
		}

		return {
			city: location.name,
			region: location.admin1 || '',
			country: location.country || '',
			timezone: forecast.timezone,
			observed_at: current.time,
			weather: describeWeather(current.weather_code),
			weather_code: current.weather_code,
			temperature_c: current.temperature_2m,
			feels_like_c: current.apparent_temperature,
			humidity_percent: current.relative_humidity_2m,
			precipitation_mm: current.precipitation,
			wind_speed_kmh: current.wind_speed_10m,
			today_max_c: forecast.daily?.temperature_2m_max?.[0] ?? null,
			today_min_c: forecast.daily?.temperature_2m_min?.[0] ?? null,
			source: 'Open-Meteo'
		}
	} catch (error) {
		console.error('[weather-demo] request failed', JSON.stringify({ city, stage, ...trace, error: error.message || String(error) }))
		return { error: error.message || '天气查询暂时不可用', stage, diagnostics: trace }
	}
}
