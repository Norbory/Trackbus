import Constants from "expo-constants";
import { Platform } from "react-native";

const DEFAULT_TUNNEL_BASE_URL = "https://2mgpcszm-3000.brs.devtunnels.ms/";
// Ruta para desarrollo en el servidor
// "https://jwwgn92n-3000.brs.devtunnels.ms/";
// Ruta para producción en Render
// "https://trackbus-server.onrender.com";

export type RutaId = "sur" | "norte" | "centro" | "este";

export type Bus = {
  id: number;
  placa: string;
  latitud: number;
  longitud: number;
  id_ruta: RutaId;
  conductor: string;
  capacidad: number;
  estado: "activo" | "inactivo" | "mantenimiento";
};

export type Paradero = {
  id: number;
  nombre: string;
  latitud: number;
  longitud: number;
  idRuta: RutaId;
  sentido: "ida" | "vuelta";
  orden: number;
  esInicial: boolean;
};

export type Ruta = {
  id: RutaId;
  nombre: string;
  origen: string;
  destino: string;
};

export type Viaje = {
  id: number;
  id_paradero: number;
  id_bus: number;
  id_ruta: RutaId;
  fec_actu: string;
};

export type BusPosition = {
  busId: string;
  id_ruta?: RutaId;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  heading?: number;
  timestamp: string;
};

export type RealtimeMeta = {
  source: "gps-mock" | "websocket";
  gpsEndpoint: string;
  pollIntervalMs: number | null;
  gpsMock: boolean;
  latestPosition: BusPosition | null;
};

type ExpoExtra = {
  apiBaseUrl?: string;
};

const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;

const fallbackHost = Platform.select({
  android: DEFAULT_TUNNEL_BASE_URL,
  default: DEFAULT_TUNNEL_BASE_URL,
});

const rawBaseUrl = expoExtra.apiBaseUrl?.trim() || fallbackHost;
const normalizedBaseUrl = rawBaseUrl.endsWith("/")
  ? rawBaseUrl.slice(0, -1)
  : rawBaseUrl;
const API_BASE = `${normalizedBaseUrl}/api`;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} en ${path}: ${body}`);
  }

  return (await response.json()) as T;
}

export async function getBuses(): Promise<Bus[]> {
  return fetchJson<Bus[]>("/buses");
}

export async function getBusById(id: number): Promise<Bus> {
  return fetchJson<Bus>(`/buses/${id}`);
}

export async function getParaderos(): Promise<Paradero[]> {
  return fetchJson<Paradero[]>("/paraderos");
}

export async function getParaderoById(id: number): Promise<Paradero> {
  return fetchJson<Paradero>(`/paraderos/${id}`);
}

export async function getRutas(): Promise<Ruta[]> {
  return fetchJson<Ruta[]>("/rutas");
}

export async function getRutaById(id: string): Promise<Ruta> {
  return fetchJson<Ruta>(`/rutas/${id}`);
}

export async function getViajes(): Promise<Viaje[]> {
  return fetchJson<Viaje[]>("/viajes");
}

export async function getViajeById(id: number): Promise<Viaje> {
  return fetchJson<Viaje>(`/viajes/${id}`);
}

export async function getRealtimePosition(): Promise<RealtimeMeta> {
  return fetchJson<RealtimeMeta>("/position/realtime");
}

export async function getMobileLatestPosition(): Promise<BusPosition> {
  return fetchJson<BusPosition>("/mobile/position/latest");
}

export function getMobilePositionStreamUrl(): string {
  return `${API_BASE}/mobile/position/stream`;
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
