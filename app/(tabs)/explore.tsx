import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Constants from "expo-constants";
import polyline from "polyline";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Polyline, type LatLng } from "react-native-maps";
import EventSource from "react-native-sse";
import {
  type Paradero as ApiParadero,
  type BusPosition,
  type RealtimeMeta,
  getParaderos,
  getMobileLatestPosition,
  getMobilePositionStreamUrl,
  getRealtimePosition,
} from "@/services/trackbus-api";

const GOOGLE_DIRECTIONS_API_KEY =
  (Constants.expoConfig?.extra?.googleDirectionsApiKey as string | undefined) ??
  "";

type Parada = {
  id: number;
  latitude: number;
  longitude: number;
  nombre: string;
};

const FALLBACK_PARADAS = [
  {
    id: 1,
    latitude: -12.058879,
    longitude: -77.080964,
    nombre: "Inicio del recorrido",
  },
  {
    id: 2,
    latitude: -12.056867,
    longitude: -77.088174,
    nombre: "Mecanica de Fluidos",
  },
  {
    id: 3,
    latitude: -12.053713,
    longitude: -77.085594,
    nombre: "Facultad de Odontologia",
  },
  {
    id: 4,
    latitude: -12.056209,
    longitude: -77.084994,
    nombre: "Facultad de Medicina",
  },
];

const BUS_ACTUAL = { latitude: -12.056866, longitude: -77.080352 };

async function obtenerRutaDesdeGoogle(paradas: Parada[]): Promise<LatLng[]> {
  if (
    !GOOGLE_DIRECTIONS_API_KEY ||
    GOOGLE_DIRECTIONS_API_KEY.includes("PEGA_AQUI")
  ) {
    console.warn(
      "Falta configurar la API key de Directions en app.json > expo.extra",
    );
    return [];
  }

  try {
    const origin = `${paradas[0].latitude},${paradas[0].longitude}`;
    const destination = `${paradas[0].latitude},${paradas[0].longitude}`;

    const waypointsIntermedios = paradas
      .slice(1)
      .map((p) => `via:${p.latitude},${p.longitude}`)
      .join("|");

    const params = new URLSearchParams({
      origin,
      destination,
      mode: "driving",
      language: "es",
      waypoints: `optimize:false|${waypointsIntermedios}`,
      key: GOOGLE_DIRECTIONS_API_KEY,
    });

    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK" && data.routes.length > 0) {
      const encodedPolyline = data.routes[0].overview_polyline.points;
      const decodedPolyline = polyline.decode(encodedPolyline);

      return decodedPolyline.map((point: number[]) => ({
        latitude: point[0],
        longitude: point[1],
      }));
    }

    console.warn("Directions API status:", data.status, data.error_message ?? "");
    return [];
  } catch (error) {
    console.error("Error al obtener ruta:", error);
    return [];
  }
}

function rutaLogicaDeParadas(paradas: Parada[]): LatLng[] {
  return [...paradas, paradas[0]].map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));
}

function calcularRegionDesdeCoords(coords: LatLng[]) {
  const latitudes = coords.map((p) => p.latitude);
  const longitudes = coords.map((p) => p.longitude);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;

  const latitudeDelta = Math.max((maxLat - minLat) * 2.2, 0.02);
  const longitudeDelta = Math.max((maxLng - minLng) * 2.2, 0.02);

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

export default function RecorridoScreen() {
  const pulso = useRef(new Animated.Value(0.8)).current;
  const mapRef = useRef<MapView>(null);
  const hasAutoZoomed = useRef(false);

  const [paradas, setParadas] = useState<Parada[]>(FALLBACK_PARADAS);
  const [mapReady, setMapReady] = useState(false);
  const [rutaPolyline, setRutaPolyline] = useState<LatLng[]>([]);
  const [cargandoRuta, setCargandoRuta] = useState(true);
  const [mensajeRuta, setMensajeRuta] = useState("El burrito esta en ruta");

  const [metaRealtime, setMetaRealtime] = useState<RealtimeMeta | null>(null);
  const [latestPosition, setLatestPosition] = useState<BusPosition | null>(null);
  const [sseState, setSseState] = useState("desconectado");
  const [sseData, setSseData] = useState<BusPosition | null>(null);

  const busMarkerPosition = useMemo(
    () =>
      sseData
        ? { latitude: sseData.latitude, longitude: sseData.longitude }
        : latestPosition
          ? {
              latitude: latestPosition.latitude,
              longitude: latestPosition.longitude,
            }
          : BUS_ACTUAL,
    [latestPosition, sseData],
  );

  useEffect(() => {
    const cargarRuta = async () => {
      setCargandoRuta(true);

      let paradasFuente = FALLBACK_PARADAS;
      try {
        const paraderosApi = await getParaderos();
        const paradasApi = paraderosApi.map(mapParaderoToParada);
        if (paradasApi.length > 1) {
          paradasFuente = paradasApi;
          setParadas(paradasApi);
        } else {
          setParadas(FALLBACK_PARADAS);
        }
      } catch {
        setParadas(FALLBACK_PARADAS);
      }

      if (
        !GOOGLE_DIRECTIONS_API_KEY ||
        GOOGLE_DIRECTIONS_API_KEY.includes("PEGA_AQUI")
      ) {
        setRutaPolyline(rutaLogicaDeParadas(paradasFuente));
        setMensajeRuta("Configura tu API de Directions en app.json");
        setCargandoRuta(false);
        return;
      }

      const ruta = await obtenerRutaDesdeGoogle(paradasFuente);
      if (ruta.length > 1) {
        setRutaPolyline(ruta);
        setMensajeRuta("Ruta en tiempo real cargada");
      } else {
        setRutaPolyline(rutaLogicaDeParadas(paradasFuente));
        setMensajeRuta("Mostrando ruta logica de respaldo");
      }
      setCargandoRuta(false);
    };

    cargarRuta();
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, {
          toValue: 1.25,
          duration: 1000,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulso, {
          toValue: 0.8,
          duration: 1000,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulso]);

  useEffect(() => {
    let mounted = true;

    const cargarPosiciones = async () => {
      try {
        const meta = await getRealtimePosition();
        if (mounted) setMetaRealtime(meta);
      } catch {
        if (mounted) setMetaRealtime(null);
      }

      try {
        const latest = await getMobileLatestPosition();
        if (mounted) setLatestPosition(latest);
      } catch {
        if (mounted) setLatestPosition(null);
      }
    };

    cargarPosiciones();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const stream = new EventSource(getMobilePositionStreamUrl());

    stream.addEventListener("open", () => {
      setSseState("conectado");
    });

    stream.addEventListener("error", () => {
      setSseState("error");
    });

    stream.addEventListener("message", (event: any) => {
      if (!event?.data || typeof event.data !== "string") return;

      try {
        const parsed = JSON.parse(event.data) as BusPosition;
        if (
          typeof parsed.latitude === "number" &&
          typeof parsed.longitude === "number"
        ) {
          setSseData(parsed);
          setLatestPosition(parsed);
          setSseState("recibiendo");
        }
      } catch {
        // El servidor tambien envia un mensaje inicial de texto no JSON.
      }
    });

    return () => {
      setSseState("cerrado");
      stream.close();
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || cargandoRuta || hasAutoZoomed.current) {
      return;
    }

    const coordsBase =
      rutaPolyline.length > 1
        ? [...rutaPolyline, busMarkerPosition]
        : [...rutaLogicaDeParadas(paradas), busMarkerPosition];

    const region = calcularRegionDesdeCoords(coordsBase);
    mapRef.current.animateToRegion(region, 700);
    hasAutoZoomed.current = true;
  }, [mapReady, rutaPolyline, busMarkerPosition, paradas, cargandoRuta]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.mapa}
        initialRegion={{
          latitude: BUS_ACTUAL.latitude,
          longitude: BUS_ACTUAL.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}
        maxZoomLevel={200}
        onMapReady={() => setMapReady(true)}
      >
        {rutaPolyline.length > 0 && (
          <>
            <Polyline
              coordinates={rutaPolyline}
              strokeColor="#FFFFFF"
              strokeWidth={10}
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />
            <Polyline
              coordinates={rutaPolyline}
              strokeColor="#2F80ED"
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
              zIndex={2}
            />
          </>
        )}

        {paradas.map((parada, index) => {
          const esInicio = index === 0;
          const esFin = index === paradas.length - 1;
          const colorPin = esInicio ? "#0E8F4E" : esFin ? "#1F5DB5" : "#2F80ED";

          return (
            <Marker
              key={parada.id}
              coordinate={{
                latitude: parada.latitude,
                longitude: parada.longitude,
              }}
              title={parada.nombre}
              zIndex={4}
            >
              <View style={styles.markerParada}>
                <View
                  style={[styles.markerParadaCard, { borderColor: colorPin }]}
                >
                  <MaterialIcons
                    name="directions-bus"
                    size={14}
                    color={colorPin}
                  />
                </View>
                <View
                  style={[
                    styles.markerParadaPunta,
                    { borderColor: colorPin, backgroundColor: colorPin },
                  ]}
                />
              </View>
            </Marker>
          );
        })}

        <Marker
          coordinate={busMarkerPosition}
          title="Burrito en ruta"
          description="Posicion actual"
          tracksViewChanges
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={5}
        >
          <View style={styles.markerBusWrap} collapsable={false}>
            <Animated.View
              style={[
                styles.ondaBus,
                {
                  transform: [{ scale: pulso }],
                  opacity: pulso.interpolate({
                    inputRange: [0.8, 1.25],
                    outputRange: [0.32, 0],
                  }),
                },
              ]}
            />
            <View style={styles.markerBus} collapsable={false}>
              <MaterialIcons name="directions-bus" size={22} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      </MapView>

      {cargandoRuta && (
        <View style={styles.badgeCargando}>
          <ActivityIndicator size="small" color="#5B2BFF" />
          <Text style={styles.badgeCargandoTexto}>Cargando ruta...</Text>
        </View>
      )}
      {!cargandoRuta && (
        <View style={styles.badge}>
          <MaterialIcons name="near-me" size={16} color="#10B981" />
          <Text style={styles.badgeTexto}>{mensajeRuta}</Text>
        </View>
      )}

      <View style={styles.dataPanel}>
        <Text style={styles.dataTitle}>Data de posicion (SSE)</Text>
        <Text style={styles.dataStatus}>Estado stream: {sseState}</Text>
        <ScrollView style={styles.dataScroll}>
          <Text style={styles.dataLabel}>GET /api/position/realtime</Text>
          <Text style={styles.dataText}>{JSON.stringify(metaRealtime, null, 2)}</Text>

          <Text style={styles.dataLabel}>GET /api/mobile/position/latest</Text>
          <Text style={styles.dataText}>{JSON.stringify(latestPosition, null, 2)}</Text>

          <Text style={styles.dataLabel}>GET /api/mobile/position/stream</Text>
          <Text style={styles.dataText}>{JSON.stringify(sseData, null, 2)}</Text>
        </ScrollView>
      </View>
    </View>
  );
}

function mapParaderoToParada(paradero: ApiParadero): Parada {
  return {
    id: paradero.id,
    nombre: paradero.nombre,
    latitude: paradero.latitud,
    longitude: paradero.longitud,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  mapa: {
    flex: 1,
  },
  badge: {
    position: "absolute",
    top: 70,
    left: 20,
    right: 20,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
  badgeTexto: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "600",
  },
  badgeCargando: {
    position: "absolute",
    top: 70,
    left: 20,
    right: 20,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
  badgeCargandoTexto: {
    color: "#5B2BFF",
    fontSize: 13,
    fontWeight: "600",
  },
  dataPanel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: 210,
    borderRadius: 12,
    backgroundColor: "rgba(17, 24, 39, 0.96)",
    borderWidth: 1,
    borderColor: "#374151",
    padding: 10,
  },
  dataTitle: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "700",
  },
  dataStatus: {
    color: "#93C5FD",
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
  },
  dataScroll: {
    maxHeight: 160,
  },
  dataLabel: {
    color: "#D1D5DB",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 6,
    marginBottom: 2,
  },
  dataText: {
    color: "#E5E7EB",
    fontSize: 11,
    fontFamily: "monospace",
  },
  markerParada: {
    alignItems: "center",
    justifyContent: "center",
  },
  markerParadaCard: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2F80ED",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  markerParadaPunta: {
    width: 10,
    height: 10,
    backgroundColor: "#1F5DB5",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    transform: [{ rotate: "45deg" }],
    marginTop: -4,
  },
  markerBusWrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  ondaBus: {},
  markerBus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#2F80ED",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    overflow: "visible",
    shadowColor: "#2F80ED",
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 8,
  },
});
