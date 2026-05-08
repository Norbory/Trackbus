import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  type Bus,
  type Paradero,
  type Ruta,
  type Viaje,
  getBusById,
  getBuses,
  getParaderos,
  getRutas,
  getViajes,
} from "@/services/trackbus-api";

type CargaBus = {
  buses: Bus[];
  busDetalle: Bus | null;
  rutas: Ruta[];
  viajes: Viaje[];
  paraderos: Paradero[];
};

type BusInfoItem = {
  etiqueta: string;
  valor: string;
};

function formatearEstado(estado?: Bus["estado"]): string {
  if (estado === "activo") return "En servicio";
  if (estado === "mantenimiento") return "Mantenimiento";
  if (estado === "inactivo") return "Inactivo";
  return "Sin estado";
}

function formatearFecha(iso?: string): string {
  if (!iso) return "Sin registro";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin registro";

  return date.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function BusScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CargaBus>({
    buses: [],
    busDetalle: null,
    rutas: [],
    viajes: [],
    paraderos: [],
  });

  useEffect(() => {
    let mounted = true;

    const cargar = async () => {
      try {
        setLoading(true);
        setError(null);

        const [buses, rutas, viajes, paraderos] = await Promise.all([
          getBuses(),
          getRutas(),
          getViajes(),
          getParaderos(),
        ]);

        const busDetalle =
          buses.length > 0 ? await getBusById(buses[0].id) : null;

        if (!mounted) return;
        setData({ buses, busDetalle, rutas, viajes, paraderos });
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

  const rutaActiva = data.busDetalle
    ? data.rutas.find((ruta) => ruta.id === data.busDetalle?.id_ruta)
    : null;

  const viajeActual = data.busDetalle
    ? data.viajes
        .filter((viaje) => viaje.id_bus === data.busDetalle?.id)
        .sort(
          (a, b) =>
            new Date(b.fec_actu).getTime() - new Date(a.fec_actu).getTime(),
        )[0]
    : null;

  const paraderoActual = viajeActual
    ? data.paraderos.find((paradero) => paradero.id === viajeActual.id_paradero)
    : null;

  const busInfo: BusInfoItem[] = [
    {
      etiqueta: "Nombre del bus",
      valor: data.busDetalle ? `Bus ${data.busDetalle.id}` : "Sin dato",
    },
    {
      etiqueta: "Numero de serie",
      valor: data.busDetalle
        ? `BUS-${String(data.busDetalle.id).padStart(3, "0")}`
        : "Sin dato",
    },
    { etiqueta: "Placa", valor: data.busDetalle?.placa ?? "Sin dato" },
    { etiqueta: "Conductor", valor: data.busDetalle?.conductor ?? "Sin asignar" },
    {
      etiqueta: "Ruta activa",
      valor: rutaActiva
        ? `${rutaActiva.origen} -> ${rutaActiva.destino}`
        : "Sin ruta",
    },
    {
      etiqueta: "Paradero actual",
      valor: paraderoActual?.nombre ?? "Sin registro",
    },
    {
      etiqueta: "Capacidad",
      valor: data.busDetalle ? `${data.busDetalle.capacidad} pasajeros` : "Sin dato",
    },
    {
      etiqueta: "Estado",
      valor: formatearEstado(data.busDetalle?.estado),
    },
    {
      etiqueta: "Ultima actualizacion",
      valor: formatearFecha(viajeActual?.fec_actu),
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.bloquePrincipal}>
        <View style={styles.logoCirculo}>
          <MaterialIcons name="directions-bus" size={34} color="#FFFFFF" />
        </View>
        <Text style={styles.titulo}>BUS</Text>
        <Text style={styles.subtitulo}>Ficha del bus</Text>
      </View>

      {loading && <Text style={styles.info}>Cargando datos...</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && !error && (
        <View style={styles.lista}>
          {busInfo.map((item) => (
            <View key={item.etiqueta} style={styles.fila}>
              <Text style={styles.etiqueta}>{item.etiqueta}</Text>
              <Text style={styles.valor}>{item.valor}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.pie}>
        <MaterialIcons name="verified" size={18} color="#5B2BFF" />
        <Text style={styles.pieTexto}>Datos sincronizados desde API</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5FB",
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  bloquePrincipal: {
    backgroundColor: "#1A1930",
    borderRadius: 24,
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  logoCirculo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#5B2BFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  titulo: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  subtitulo: {
    color: "#A9A8C7",
    fontSize: 14,
    marginTop: 4,
  },
  info: {
    fontSize: 14,
    color: "#2D2B4F",
    marginBottom: 8,
  },
  error: {
    fontSize: 14,
    color: "#B91C1C",
    marginBottom: 8,
  },
  lista: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 2,
  },
  fila: {
    borderBottomColor: "#ECEBF4",
    borderBottomWidth: 1,
    paddingVertical: 12,
    gap: 4,
  },
  etiqueta: {
    color: "#7E7C98",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  valor: {
    color: "#1E1C2F",
    fontSize: 16,
    fontWeight: "700",
  },
  pie: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pieTexto: {
    color: "#524F7B",
    fontSize: 13,
    fontWeight: "600",
  },
});
