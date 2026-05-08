import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  type Bus,
  type Ruta,
  type Viaje,
  getBuses,
  getRutas,
  getViajes,
} from "@/services/trackbus-api";

type EstadoRuta = "En salida" | "En ruta" | "Programado";

type RutaUI = {
  id: Ruta["id"];
  nombre: string;
  salida: string;
  llegada: string;
  unidad: string;
  conductor: string;
  estado: EstadoRuta;
  imagenRuta: number;
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

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    rutas: Ruta[];
    buses: Bus[];
    viajes: Viaje[];
  }>({
    rutas: [],
    buses: [],
    viajes: [],
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

      return {
        id: ruta.id,
        nombre: normalizarNombreRuta(ruta.nombre),
        salida,
        llegada,
        unidad: busRuta ? `Bus ${busRuta.placa}` : "Bus sin asignar",
        conductor: busRuta?.conductor ?? "Sin asignar",
        estado: mapEstadoBus(busRuta?.estado),
        imagenRuta: imagenPorRuta[ruta.id],
      };
    });
  }, [data.buses, data.rutas, data.viajes]);

  const rutaActiva = useMemo(() => {
    return rutasUi.find((ruta) => ruta.estado === "En ruta") ?? rutasUi[0];
  }, [rutasUi]);

  const siguienteSalida = useMemo(() => {
    if (rutasUi.length === 0) return "--:--";

    const candidatas = rutasUi
      .map((ruta) => ruta.salida)
      .filter((hora) => hora !== "--:--")
      .sort();

    return candidatas[0] ?? "--:--";
  }, [rutasUi]);

  useEffect(() => {
    let mounted = true;

    const cargar = async () => {
      try {
        setLoading(true);
        setError(null);

        const [rutas, buses, viajes] = await Promise.all([
          getRutas(),
          getBuses(),
          getViajes(),
        ]);

        if (!mounted) return;

        setData({
          rutas,
          buses,
          viajes,
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
            source={require("@/assets/images/burrito.png")}
            style={styles.imagenBus}
            contentFit="cover"
          />
          <View style={styles.capaOscura} />
          <View style={styles.infoPrincipal}>
            <Text style={styles.tituloPrincipal}>Burrito en servicio</Text>
            <Text style={styles.subPrincipal}>
              {rutaActiva?.unidad ?? "Bus sin asignar"} - Ruta {rutaActiva?.nombre ?? "-"}
            </Text>
          </View>
        </View>

        <View style={styles.estadoRapidoFila}>
          <View style={styles.fichaEstadoRapida}>
            <Text style={styles.etiquetaFicha}>Ruta activa</Text>
            <Text style={styles.valorFicha}>{rutaActiva?.nombre ?? "-"}</Text>
          </View>
          <View style={styles.fichaEstadoRapida}>
            <Text style={styles.etiquetaFicha}>Siguiente salida</Text>
            <Text style={styles.valorFicha}>{siguienteSalida}</Text>
          </View>
          <View style={styles.fichaEstadoRapida}>
            <Text style={styles.etiquetaFicha}>Conductor</Text>
            <Text style={styles.valorFichaMini}>{rutaActiva?.conductor ?? "-"}</Text>
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
                <View key={ruta.id} style={styles.cardRuta}>
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
                    <Text style={styles.cardRutaSub}>{ruta.unidad}</Text>
                    <Text style={styles.cardRutaSub}>Conductor: {ruta.conductor}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.timelineCard}>
              <View style={styles.timelineHeader}>
                <Text style={styles.timelineTitulo}>Linea de tiempo de buses</Text>
                <Text style={styles.timelineSub}>Hoy</Text>
              </View>

              {rutasUi.map((ruta, index) => (
                <View key={`${ruta.id}-${ruta.salida}`} style={styles.timelineItem}>
                  <View style={styles.timelineColIzquierda}>
                    <Text style={styles.horaSalida}>{ruta.salida}</Text>
                    <Text style={styles.horaLlegada}>a {ruta.llegada}</Text>
                  </View>

                  <View style={styles.timelineColCentro}>
                    <View
                      style={[
                        styles.timelinePunto,
                        { backgroundColor: colorEstado[ruta.estado] },
                      ]}
                    />
                    {index !== rutasUi.length - 1 && (
                      <View style={styles.timelineLinea} />
                    )}
                  </View>

                  <View style={styles.timelineColDerecha}>
                    <Text style={styles.timelineRuta}>Ruta {ruta.nombre}</Text>
                    <Text style={styles.timelineDetalle}>{ruta.unidad}</Text>
                    <Text style={styles.timelineDetalle}>Conductor: {ruta.conductor}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
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
    fontSize: 14,
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
  info: {
    fontSize: 14,
    color: "#3A3954",
  },
  error: {
    fontSize: 14,
    color: "#B91C1C",
  },
});
