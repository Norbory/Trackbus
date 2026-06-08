import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Constants from "expo-constants";
import polyline from "polyline";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
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
  idRuta?: string;
  sentido?: "ida" | "vuelta";
};

type RutaId = "norte" | "sur" | "este" | "centro";
type Sentido = "ida" | "vuelta";

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
  if (paradas.length < 2) {
    return [];
  }

  if (
    !GOOGLE_DIRECTIONS_API_KEY
  ) {
    console.warn(
      "Falta configurar la API key de Directions en app.json > expo.extra",
    );
    return [];
  }

  try {
    const origin = `${paradas[0].latitude},${paradas[0].longitude}`;
    const destination = `${paradas[paradas.length - 1].latitude},${paradas[paradas.length - 1].longitude}`;

    const waypointsIntermedios = paradas
      .slice(1, -1)
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
  return paradas.map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));
}

function esCoordenadasValida(lat: any, lng: any): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    isFinite(lat) &&
    isFinite(lng)
  );
}

function normalizarParadas(paraderosApi: ApiParadero[]): Parada[] {
  const normalizadas: Parada[] = [];

  for (const paradero of paraderosApi) {
    const rawLat = (paradero as any).latitud ?? (paradero as any).latitude;
    const rawLng = (paradero as any).longitud ?? (paradero as any).longitude;
    const rawRuta = (paradero as any).idRuta ?? (paradero as any).id_ruta;
    const rawSentido = (paradero as any).sentido;

    if (!esCoordenadasValida(rawLat, rawLng)) {
      continue;
    }

    normalizadas.push({
      id: paradero.id,
      nombre: paradero.nombre,
      latitude: rawLat,
      longitude: rawLng,
      idRuta: typeof rawRuta === "string" ? rawRuta : undefined,
      sentido:
        rawSentido === "ida" || rawSentido === "vuelta"
          ? rawSentido
          : undefined,
    });
  }

  return normalizadas;
}

function resolverParadasFuente(paradasApi: Parada[]): Parada[] {
  if (paradasApi.length > 1) {
    return paradasApi;
  }

  if (paradasApi.length === 1) {
    return [paradasApi[0], ...FALLBACK_PARADAS.slice(1)];
  }

  return FALLBACK_PARADAS;
}

function crearClaveParada(parada: Parada, index: number): string {
  return [
    parada.id,
    parada.idRuta ?? "sin-ruta",
    parada.sentido ?? "sin-sentido",
    parada.latitude,
    parada.longitude,
    index,
  ].join("-");
}

export default function RecorridoScreen() {
  const pulso = useRef(new Animated.Value(0.8)).current;
  const mapRef = useRef<MapView>(null);

  const [paradas, setParadas] = useState<Parada[]>(FALLBACK_PARADAS);
  const [todasLasParadas, setTodasLasParadas] = useState<Parada[]>(FALLBACK_PARADAS);
  const [mapReady, setMapReady] = useState(false);
  const [rutaPolyline, setRutaPolyline] = useState<LatLng[]>([]);
  const [cargandoRuta, setCargandoRuta] = useState(true);
  const [mensajeRuta, setMensajeRuta] = useState("El burrito esta en ruta");

  const [metaRealtime, setMetaRealtime] = useState<RealtimeMeta | null>(null);
  const [latestPosition, setLatestPosition] = useState<BusPosition | null>(null);
  const [sseState, setSseState] = useState("desconectado");
  const [sseData, setSseData] = useState<BusPosition | null>(null);

  const [rutaSeleccionada, setRutaSeleccionada] = useState<RutaId | null>("norte");
  const [sentidoSeleccionado, setSentidoSeleccionado] = useState<Sentido | null>("ida");
  const [mostrarMenuRutas, setMostrarMenuRutas] = useState(false);

  const paradasFiltradas = useMemo(() => {
    const filtradas = todasLasParadas.filter(
      (p) =>
        p.idRuta === rutaSeleccionada &&
        p.sentido === sentidoSeleccionado &&
        esCoordenadasValida(p.latitude, p.longitude),
    );

    const vistas = new Set<string>();

    return filtradas.filter((parada, index) => {
      const firma = crearClaveParada(parada, index);
      if (vistas.has(firma)) {
        return false;
      }

      vistas.add(firma);
      return true;
    });
  }, [todasLasParadas, rutaSeleccionada, sentidoSeleccionado]);

  useEffect(() => {
    const cargarRuta = async () => {
      try {
        const paraderosApi = await getParaderos();
        const paradasApi = normalizarParadas(paraderosApi);
        setTodasLasParadas(
          paradasApi.length > 0 ? paradasApi : resolverParadasFuente(paradasApi),
        );
      } catch {
        setTodasLasParadas(FALLBACK_PARADAS);
        setParadas(FALLBACK_PARADAS);
      }
    };

    cargarRuta();
  }, []);

  useEffect(() => {
    const cargarRutaSeleccionada = async () => {
      setCargandoRuta(true);

      if (paradasFiltradas.length < 2) {
        setRutaPolyline([]);
        setMensajeRuta("Selecciona ruta y sentido para ver el trazado");
        setCargandoRuta(false);
        return;
      }

      if (paradasFiltradas.length > 25) {
        setRutaPolyline(rutaLogicaDeParadas(paradasFiltradas));
        setMensajeRuta("Ruta larga: mostrando trazado logico");
        setCargandoRuta(false);
        return;
      }

      if (
        !GOOGLE_DIRECTIONS_API_KEY
      ) {
        setRutaPolyline(
          rutaLogicaDeParadas(paradasFiltradas),
        );
        setMensajeRuta("Configura tu API de Directions en app.json");
        setCargandoRuta(false);
        return;
      }

      const ruta = await obtenerRutaDesdeGoogle(paradasFiltradas);
      if (ruta.length > 1) {
        setRutaPolyline(ruta);
        setMensajeRuta("Ruta en tiempo real cargada");
      } else {
        setRutaPolyline(
          rutaLogicaDeParadas(paradasFiltradas),
        );
        setMensajeRuta("Mostrando ruta logica de respaldo");
      }
      setCargandoRuta(false);
    };

    cargarRutaSeleccionada();
  }, [paradasFiltradas]);

  useEffect(() => {
    setParadas(paradasFiltradas);
  }, [paradasFiltradas]);

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
    if (!mapReady || !mapRef.current || cargandoRuta || paradasFiltradas.length === 0) {
      return;
    }

    const primeraParada = paradasFiltradas[0];
    mapRef.current.animateToRegion(
      {
        latitude: primeraParada.latitude,
        longitude: primeraParada.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      700,
    );
  }, [mapReady, paradasFiltradas, cargandoRuta]);

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
        maxZoomLevel={120}
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
          if (!esCoordenadasValida(parada.latitude, parada.longitude)) {
            return null;
          }

          const esInicio = index === 0;
          const esFin = index === paradas.length - 1;
          const colorPin = esInicio ? "#0E8F4E" : esFin ? "#1F5DB5" : "#2F80ED";

          return (
            <Marker
              key={crearClaveParada(parada, index)}
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

        {/*
          Icono del autobus desactivado temporalmente.
          {esCoordenadasValida(busMarkerPosition.latitude, busMarkerPosition.longitude) && (
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
          )}
        */}
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

      {/* Botón flotante para abrir menú de rutas */}
      <Pressable
        onPress={() => setMostrarMenuRutas(true)}
        style={styles.botonFlotante}
      >
        <View style={styles.botonFlotanteIconoWrap}>
          <MaterialIcons name="alt-route" size={20} color="#5B2BFF" />
        </View>
        <View style={styles.botonFlotanteTextoWrap}>
          <Text style={styles.botonFlotanteEtiqueta}>Ruta activa</Text>
          <Text style={styles.botonFlotanteTexto}>
            {rutaSeleccionada && sentidoSeleccionado
              ? `${rutaSeleccionada.toUpperCase()} - ${sentidoSeleccionado.toUpperCase()}`
              : "Seleccionar"}
          </Text>
        </View>
      </Pressable>

      {/* Modal para seleccionar ruta y sentido */}
      <Modal
        visible={mostrarMenuRutas}
        transparent
        animationType="fade"
        onRequestClose={() => setMostrarMenuRutas(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMostrarMenuRutas(false)}
        >
          <View style={styles.menuContenedor}>
            <Text style={styles.menuTitulo}>Seleccionar Ruta</Text>

            <ScrollView style={styles.menuRutas}>
              {(["norte", "sur", "este", "centro"] as RutaId[]).map((ruta) => (
                <Pressable
                  key={ruta}
                  onPress={() => {
                    setRutaSeleccionada(ruta);
                    setSentidoSeleccionado(null);
                  }}
                  style={[
                    styles.menuRutaItem,
                    rutaSeleccionada === ruta && styles.menuRutaItemActivo,
                  ]}
                >
                  <View
                    style={[
                      styles.rutaIndicador,
                      rutaSeleccionada === ruta && styles.rutaIndicadorActivo,
                    ]}
                  />
                  <Text
                    style={[
                      styles.menuRutaTexto,
                      rutaSeleccionada === ruta && styles.menuRutaTextoActivo,
                    ]}
                  >
                    {ruta.charAt(0).toUpperCase() + ruta.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {rutaSeleccionada && (
              <>
                <View style={styles.divisor} />
                <Text style={styles.menuTitulo}>Seleccionar Sentido</Text>

                <View style={styles.menuSentidos}>
                  {(["ida", "vuelta"] as Sentido[]).map((sentido) => (
                    <Pressable
                      key={sentido}
                      onPress={() => {
                        setSentidoSeleccionado(sentido);
                        setMostrarMenuRutas(false);
                      }}
                      style={[
                        styles.menuSentidoItem,
                        sentidoSeleccionado === sentido &&
                          styles.menuSentidoItemActivo,
                      ]}
                    >
                      <View
                        style={[
                          styles.sentidoIndicador,
                          sentidoSeleccionado === sentido &&
                            styles.sentidoIndicadorActivo,
                        ]}
                      />
                      <Text
                        style={[
                          styles.menuSentidoTexto,
                          sentidoSeleccionado === sentido &&
                            styles.menuSentidoTextoActivo,
                        ]}
                      >
                        {sentido.charAt(0).toUpperCase() + sentido.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Pressable
              onPress={() => setMostrarMenuRutas(false)}
              style={styles.botonarCerrar}
            >
              <Text style={styles.botonarCerrarTexto}>Cerrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
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
    display: "none",
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
  botonFlotante: {
    position: "absolute",
    bottom: 24,
    right: 16,
    backgroundColor: "#5B2BFF",
    borderRadius: 18,
    minWidth: 176,
    height: 56,
    paddingHorizontal: 10,
    justifyContent: "flex-start",
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    shadowColor: "#5B2BFF",
    shadowOpacity: 0.42,
    shadowOffset: { width: 0, height: 7 },
    shadowRadius: 14,
    elevation: 12,
  },
  botonFlotanteIconoWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#140A36",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 2,
  },
  botonFlotanteTextoWrap: {
    flex: 1,
    justifyContent: "center",
  },
  botonFlotanteEtiqueta: {
    color: "#DDD5FF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  botonFlotanteTexto: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  menuContenedor: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
    paddingBottom: 30,
  },
  menuTitulo: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
  },
  menuRutas: {
    marginBottom: 16,
  },
  menuRutaItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    gap: 12,
  },
  menuRutaItemActivo: {
    backgroundColor: "#E9D5FF",
  },
  rutaIndicador: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  rutaIndicadorActivo: {
    borderColor: "#5B2BFF",
    backgroundColor: "#5B2BFF",
  },
  menuRutaTexto: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  menuRutaTextoActivo: {
    color: "#5B2BFF",
  },
  divisor: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
  },
  menuSentidos: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  menuSentidoItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    gap: 8,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  menuSentidoItemActivo: {
    backgroundColor: "#E9D5FF",
    borderColor: "#5B2BFF",
  },
  sentidoIndicador: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  sentidoIndicadorActivo: {
    borderColor: "#5B2BFF",
    backgroundColor: "#5B2BFF",
  },
  menuSentidoTexto: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  menuSentidoTextoActivo: {
    color: "#5B2BFF",
  },
  botonarCerrar: {
    backgroundColor: "#5B2BFF",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 16,
  },
  botonarCerrarTexto: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
