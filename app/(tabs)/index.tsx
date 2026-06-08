import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
} from "react-native";
import {
  type Bus,
  type Paradero,
  type Ruta,
  type Viaje,
  getBuses,
  getParaderos,
  getRutas,
  getViajes,
} from "@/services/trackbus-api";

type EstadoRuta = "En salida" | "En ruta" | "Programado";
type SentidoUI = "Ida" | "Vuelta" | "-";

type RutaUI = {
  id: Ruta["id"];
  nombre: string;
  salida: string;
  llegada: string;
  sentido: SentidoUI;
  estado: EstadoRuta;
  paraderos: string[];
  imagenRuta: number;
};

type TimelineItem = {
  key: string;
  nombreRuta: string;
  salida: string;
  llegada: string;
  sentido: SentidoUI;
  estado: EstadoRuta;
  paraderos: string[];
};

const colorEstado: Record<EstadoRuta, string> = {
  "En salida": "#F59E0B",
  "En ruta": "#16A34A",
  Programado: "#3B82F6",
};

const imagenPorRuta: Record<Ruta["id"], number> = {
  este: require("@/assets/images/ruta_este.jpg"),
  sur: require("@/assets/images/ruta_sur.jpg"),
  centro: require("@/assets/images/ruta_centro.jpg"),
  norte: require("@/assets/images/ruta_norte.jpg"),
};

function mapEstadoBus(estado?: Bus["estado"]): EstadoRuta {
  if (estado === "activo") return "En ruta";
  if (estado === "mantenimiento") return "En salida";
  return "Programado";
}

function formatHora(iso?: string): string {
  if (!iso) return "--:--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";

  return date.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function normalizarNombreRuta(nombre: string): string {
  return nombre.replace(/^ruta\s+/i, "").trim();
}

function mapParaderoToRutaInfo(paradero: Paradero): {
  nombre: string;
  idRuta: Ruta["id"] | undefined;
  sentido: "ida" | "vuelta" | undefined;
  orden: number;
} {
  const raw = paradero as any;
  const idRuta = (raw.idRuta ?? raw.id_ruta) as Ruta["id"] | undefined;
  const sentido = raw.sentido as "ida" | "vuelta" | undefined;
  const orden = typeof raw.orden === "number" ? raw.orden : Number.MAX_SAFE_INTEGER;

  return {
    nombre: paradero.nombre,
    idRuta,
    sentido,
    orden,
  };
}

export default function HomeScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rutaSeleccionada, setRutaSeleccionada] = useState<RutaUI | null>(null);
  const [timelinePageIndex, setTimelinePageIndex] = useState(0);
  const [data, setData] = useState<{
    rutas: Ruta[];
    buses: Bus[];
    viajes: Viaje[];
    paraderos: Paradero[];
  }>({
    rutas: [],
    buses: [],
    viajes: [],
    paraderos: [],
  });

  const rutasUi = useMemo<RutaUI[]>(() => {
    return data.rutas.map((ruta) => {
      const busRuta = data.buses.find((bus) => bus.id_ruta === ruta.id);
      const viajesRuta = data.viajes
        .filter((viaje) => viaje.id_ruta === ruta.id)
        .sort(
          (a, b) =>
            new Date(a.fec_actu).getTime() - new Date(b.fec_actu).getTime(),
        );

      const salida = formatHora(viajesRuta[0]?.fec_actu);
      const llegada = formatHora(viajesRuta[viajesRuta.length - 1]?.fec_actu);
      const ultimoViaje = viajesRuta[viajesRuta.length - 1];

      const paraderoUltimoViaje = data.paraderos.find(
        (paradero) => paradero.id === ultimoViaje?.id_paradero,
      );

      const rawSentido = (paraderoUltimoViaje as any)?.sentido;
      const sentido: SentidoUI =
        rawSentido === "vuelta" ? "Vuelta" : rawSentido === "ida" ? "Ida" : "-";

      const paraderosRuta = data.paraderos
        .map(mapParaderoToRutaInfo)
        .filter((paradero) => paradero.idRuta === ruta.id)
        .sort((a, b) => a.orden - b.orden);

      const paraderosIda = paraderosRuta.filter((paradero) => paradero.sentido === "ida");
      const baseParaderos = paraderosIda.length > 0 ? paraderosIda : paraderosRuta;
      const primeraParada = baseParaderos[0]?.nombre ?? "--";
      const ultimaParada =
        baseParaderos[baseParaderos.length - 1]?.nombre ?? primeraParada;

      return {
        id: ruta.id,
        nombre: normalizarNombreRuta(ruta.nombre),
        salida,
        llegada,
        sentido,
        estado: mapEstadoBus(busRuta?.estado),
        paraderos: [primeraParada, ultimaParada],
        imagenRuta: imagenPorRuta[ruta.id],
      };
    });
  }, [data.buses, data.paraderos, data.rutas, data.viajes]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const paraderosPorId = new Map(data.paraderos.map((paradero) => [paradero.id, paradero]));

    return data.rutas.flatMap((ruta) => {
      const busRuta = data.buses.find((bus) => bus.id_ruta === ruta.id);
      const nombreRuta = normalizarNombreRuta(ruta.nombre);

      return (["ida", "vuelta"] as const).map((sentidoRaw) => {
        const sentido: SentidoUI = sentidoRaw === "ida" ? "Ida" : "Vuelta";

        const viajesSentido = data.viajes
          .filter((viaje) => {
            if (viaje.id_ruta !== ruta.id) return false;

            const paradero = paraderosPorId.get(viaje.id_paradero);
            return paradero?.sentido === sentidoRaw;
          })
          .sort(
            (a, b) =>
              new Date(a.fec_actu).getTime() - new Date(b.fec_actu).getTime(),
          );

        const paraderosSentido = data.paraderos
          .map(mapParaderoToRutaInfo)
          .filter(
            (paradero) =>
              paradero.idRuta === ruta.id && paradero.sentido === sentidoRaw,
          )
          .sort((a, b) => a.orden - b.orden);

        const primeraParada = paraderosSentido[0]?.nombre ?? "--";
        const ultimaParada =
          paraderosSentido[paraderosSentido.length - 1]?.nombre ?? primeraParada;

        return {
          key: `${ruta.id}-${sentidoRaw}`,
          nombreRuta,
          salida: formatHora(viajesSentido[0]?.fec_actu),
          llegada: formatHora(viajesSentido[viajesSentido.length - 1]?.fec_actu),
          sentido,
          estado: mapEstadoBus(busRuta?.estado),
          paraderos: [primeraParada, ultimaParada],
        };
      });
    });
  }, [data.buses, data.paraderos, data.rutas, data.viajes]);

  const timelinePages = useMemo(
    () => [
      {
        id: "ida",
        titulo: "Ida",
        items: timelineItems.filter((item) => item.sentido === "Ida"),
      },
      {
        id: "vuelta",
        titulo: "Vuelta",
        items: timelineItems.filter((item) => item.sentido === "Vuelta"),
      },
    ],
    [timelineItems],
  );

  const rutaActiva = useMemo(() => {
    return rutasUi.find((ruta) => ruta.estado === "En ruta") ?? rutasUi[0];
  }, [rutasUi]);

  const siguienteSalida = useMemo(() => {
    if (rutasUi.length === 0) return "--:--";

    const candidatas = rutasUi
      .map((ruta) => ruta.salida)
      .filter((hora) => hora === "07:30")
      .sort();

    return candidatas[0] ?? "07:30";
  }, [rutasUi]);

  useEffect(() => {
    setTimelinePageIndex((prev) => Math.min(prev, Math.max(timelinePages.length - 1, 0)));
  }, [timelinePages.length]);

  const timelinePageWidth = Math.max(windowWidth - 68, 250);

  const onTimelineScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / timelinePageWidth);
    const boundedIndex = Math.max(0, Math.min(index, timelinePages.length - 1));
    setTimelinePageIndex(boundedIndex);
  };

  useEffect(() => {
    let mounted = true;

    const cargar = async () => {
      try {
        setLoading(true);
        setError(null);

        const [rutas, buses, viajes, paraderos] = await Promise.all([
          getRutas(),
          getBuses(),
          getViajes(),
          getParaderos(),
        ]);

        if (!mounted) return;

        setData({
          rutas,
          buses,
          viajes,
          paraderos,
        });
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar data");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    cargar();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.saludo}>Buenos dias</Text>
            <Text style={styles.usuario}>Alumno</Text>
          </View>
          <View style={styles.accionRedonda}>
            <MaterialIcons name="notifications-none" size={22} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.tarjetaPrincipal}>
          <Image
            source={require("@/assets/images/bus_rojo.jpg")}
            style={styles.imagenBus}
            contentFit="cover"
          />
          <View style={styles.capaOscura} />
          <View style={styles.infoPrincipal}>
            <Text style={styles.tituloPrincipal}>Burrito en servicio</Text>
            {/* <Text style={styles.subPrincipal}>
              Ruta para tomar la puerta 3
            </Text> */}
          </View>
        </View>

        <View style={styles.estadoRapidoFila}>
          <View style={styles.fichaEstadoRapida}>
            <Text style={styles.etiquetaFicha}>Ruta</Text>
            <Text style={styles.valorFicha}>Perimetral</Text>
          </View>
          <View style={styles.fichaEstadoRapida}>
            <Text style={styles.etiquetaFicha}>Hora de inicio</Text>
            <Text style={styles.valorFicha}>{siguienteSalida}</Text>
          </View>
          <View style={styles.fichaEstadoRapida}>
            <Text style={styles.etiquetaFicha}>Estado</Text>
            <Text style={styles.valorFichaMini}>{rutaActiva?.estado ?? "-"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.panelPrincipal}>
        <Text style={styles.seccionTitulo}>Rutas disponibles</Text>

        {loading && <Text style={styles.info}>Cargando datos...</Text>}
        {error && <Text style={styles.error}>{error}</Text>}

        {!loading && !error && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rutasScroller}
            >
              {rutasUi.map((ruta) => (
                <Pressable
                  key={ruta.id}
                  style={styles.cardRuta}
                  onPress={() => setRutaSeleccionada(ruta)}
                >
                  <Image
                    source={ruta.imagenRuta}
                    style={styles.imagenRuta}
                    contentFit="cover"
                  />
                  <View style={styles.cardRutaContenido}>
                    <View style={styles.cardRutaTop}>
                      <Text style={styles.cardRutaTitulo}>Ruta {ruta.nombre}</Text>
                      <View
                        style={[
                          styles.badgeEstado,
                          { backgroundColor: colorEstado[ruta.estado] },
                        ]}
                      >
                        <Text style={styles.badgeEstadoTexto}>{ruta.estado}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardRutaSub}>
                      Paraderos: {ruta.paraderos.join(" - ")}
                    </Text>
                    <Text style={styles.cardRutaSub}>Estado: {ruta.estado}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.timelineCard}>
              <View style={styles.timelineHeader}>
                <Text style={styles.timelineTitulo}>Linea de tiempo de buses</Text>
                <Text style={styles.timelineSub}>Hoy</Text>
              </View>

              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onTimelineScrollEnd}
                contentContainerStyle={styles.timelineCarouselTrack}
              >
                {timelinePages.map((page) => (
                  <View key={page.id} style={[styles.timelinePage, { width: timelinePageWidth }]}>
                    <Text style={styles.timelinePageTitle}>Sentido {page.titulo}</Text>

                    {page.items.map((item, index) => (
                      <View key={item.key} style={styles.timelineItem}>
                        <View style={styles.timelineColIzquierda}>
                          <Text style={styles.horaSalida}>{item.salida}</Text>
                        </View>

                        <View style={styles.timelineColCentro}>
                          <View
                            style={[
                              styles.timelinePunto,
                              { backgroundColor: colorEstado[item.estado] },
                            ]}
                          />
                          {index !== page.items.length - 1 && (
                            <View style={styles.timelineLinea} />
                          )}
                        </View>

                        <View style={styles.timelineColDerecha}>
                          <Text style={styles.timelineRuta}>Ruta {item.nombreRuta}</Text>
                          <Text style={styles.timelineDetalle}>Sentido: {item.sentido}</Text>
                          <Text style={styles.timelineDetalle}>
                            Paraderos: {item.paraderos.join(" - ")}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.timelineDots}>
                {timelinePages.map((page, index) => (
                  <View
                    key={page.id}
                    style={[
                      styles.timelineDot,
                      index === timelinePageIndex && styles.timelineDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          </>
        )}
      </View>

      <Modal
        visible={rutaSeleccionada !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setRutaSeleccionada(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setRutaSeleccionada(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            {rutaSeleccionada && (
              <>
                <Image
                  source={rutaSeleccionada.imagenRuta}
                  style={styles.modalImagen}
                  contentFit="contain"
                />
                <Pressable
                  style={styles.modalCerrar}
                  onPress={() => setRutaSeleccionada(null)}
                >
                  <MaterialIcons name="close" size={20} color="#FFFFFF" />
                  <Text style={styles.modalCerrarTexto}>Salir</Text>
                </Pressable>
                <View style={styles.modalContenido}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitulo}>
                      Ruta {rutaSeleccionada.nombre}
                    </Text>
                    <Text style={styles.modalSubtitulo}>
                      Paraderos: {rutaSeleccionada.paraderos.join(" - ")}
                    </Text>
                  </View>

                  <Text style={styles.modalEstado}>
                    Estado: {rutaSeleccionada.estado}
                  </Text>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F2F3FA",
  },
  content: {
    paddingBottom: 30,
  },
  hero: {
    backgroundColor: "#11111C",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingTop: 66,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  saludo: {
    color: "#9A9AB2",
    fontSize: 14,
  },
  usuario: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  accionRedonda: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#302E49",
    justifyContent: "center",
    alignItems: "center",
  },
  tarjetaPrincipal: {
    position: "relative",
    borderRadius: 18,
    overflow: "hidden",
    height: 158,
    marginBottom: 12,
  },
  imagenBus: {
    width: "100%",
    height: "100%",
  },
  capaOscura: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(9, 10, 22, 0.35)",
  },
  infoPrincipal: {
    position: "absolute",
    left: 14,
    bottom: 14,
    right: 14,
  },
  tituloPrincipal: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  subPrincipal: {
    color: "#E4E6F7",
    marginTop: 4,
    fontSize: 13,
  },
  estadoRapidoFila: {
    flexDirection: "row",
    gap: 10,
  },
  fichaEstadoRapida: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#252534",
    padding: 10,
  },
  etiquetaFicha: {
    color: "#B6B8CE",
    fontSize: 11,
  },
  valorFicha: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  valorFichaMini: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  panelPrincipal: {
    paddingHorizontal: 20,
    paddingTop: 22,
    gap: 14,
  },
  seccionTitulo: {
    color: "#17172B",
    fontSize: 19,
    fontWeight: "900",
  },
  rutasScroller: {
    gap: 12,
    paddingRight: 20,
  },
  cardRuta: {
    width: 250,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  cardRutaPressed: {
    opacity: 0.92,
  },
  imagenRuta: {
    width: "100%",
    height: 120,
  },
  cardRutaContenido: {
    padding: 12,
    gap: 4,
  },
  cardRutaTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardRutaTitulo: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1B1B2F",
  },
  badgeEstado: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeEstadoTexto: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  cardRutaSub: {
    color: "#5A5973",
    fontSize: 13,
  },
  timelineCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    gap: 8,
  },
  timelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  timelineTitulo: {
    color: "#17172B",
    fontSize: 18,
    fontWeight: "900",
  },
  timelineSub: {
    color: "#8A8AA3",
    fontSize: 12,
    maxWidth: 160,
    textAlign: "right",
  },
  timelineCarouselTrack: {
    alignItems: "flex-start",
  },
  timelinePage: {
    paddingRight: 8,
  },
  timelinePageTitle: {
    color: "#26253E",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  timelineColIzquierda: {
    width: 58,
  },
  horaSalida: {
    color: "#17172B",
    fontSize: 15,
    fontWeight: "800",
  },
  horaLlegada: {
    color: "#7A7892",
    fontSize: 12,
    marginTop: 1,
  },
  timelineColCentro: {
    width: 16,
    alignItems: "center",
  },
  timelinePunto: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineLinea: {
    width: 2,
    height: 40,
    backgroundColor: "#E4E4EF",
    marginTop: 4,
  },
  timelineColDerecha: {
    flex: 1,
    paddingBottom: 10,
  },
  timelineRuta: {
    color: "#1B1B2F",
    fontSize: 17,
    fontWeight: "800",
  },
  timelineDetalle: {
    color: "#6D6B86",
    fontSize: 13,
    marginTop: 2,
  },
  timelineDots: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D7D8E8",
  },
  timelineDotActive: {
    width: 18,
    backgroundColor: "#3B82F6",
  },
  info: {
    fontSize: 14,
    color: "#3A3954",
  },
  error: {
    fontSize: 14,
    color: "#B91C1C",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(8, 10, 20, 0.82)",
  },
  modalCard: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#000000",
    alignItems: "stretch",
    justifyContent: "flex-end",
  },
  modalImagen: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContenido: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 32,
    gap: 10,
    backgroundColor: "rgba(8, 10, 20, 0.38)",
  },
  modalHeader: {
    gap: 6,
  },
  modalTitulo: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  modalSubtitulo: {
    color: "#C8C9D9",
    fontSize: 14,
    marginTop: 4,
  },
  modalCerrar: {
    position: "absolute",
    top: 56,
    right: 20,
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    backgroundColor: "rgba(12, 14, 26, 0.72)",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
  },
  modalCerrarTexto: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  modalEstado: {
    color: "#E7E8F4",
    fontSize: 15,
    fontWeight: "700",
  },
});
