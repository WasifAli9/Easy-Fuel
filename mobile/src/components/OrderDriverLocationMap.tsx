import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { WebView } from "react-native-webview";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type DriverLocationResponse = {
  latitude?: number | null;
  longitude?: number | null;
  driverName?: string;
  orderState?: string;
  lastUpdate?: string | null;
  locationSource?: string;
};

function buildLeafletHtml(
  deliveryLat: number,
  deliveryLng: number,
  driverLat: number | null,
  driverLng: number | null,
  driverName: string,
) {
  const centerLat = driverLat ?? deliveryLat;
  const centerLng = driverLng ?? deliveryLng;
  const driverMarker =
    driverLat != null && driverLng != null
      ? `
    L.marker([${driverLat}, ${driverLng}], { icon: driverIcon }).addTo(map)
      .bindPopup(${JSON.stringify(driverName || "Driver")});
    `
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], ${driverLat != null ? 13 : 12});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    var deliveryIcon = L.divIcon({
      className: '',
      html: '<div style="background:#0D9488;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    var driverIcon = L.divIcon({
      className: '',
      html: '<div style="background:#16a34a;width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    L.marker([${deliveryLat}, ${deliveryLng}], { icon: deliveryIcon }).addTo(map)
      .bindPopup('Delivery location');
    ${driverMarker}
    var bounds = L.latLngBounds([[${deliveryLat}, ${deliveryLng}]]);
    ${driverLat != null ? `bounds.extend([${driverLat}, ${driverLng}]);` : ""}
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  </script>
</body>
</html>`;
}

type Props = {
  orderId: string;
  deliveryLat: number;
  deliveryLng: number;
};

export function OrderDriverLocationMap({ orderId, deliveryLat, deliveryLng }: Props) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);

  const locationQuery = useQuery({
    queryKey: ["/api/orders", orderId, "driver-location"],
    enabled: !!orderId,
    queryFn: async () => {
      const { data } = await apiClient.get<DriverLocationResponse>(
        `/api/orders/${encodeURIComponent(orderId)}/driver-location`,
      );
      return data;
    },
    refetchInterval: 2_000,
    retry: false,
  });

  const driverLat =
    locationQuery.data?.latitude != null && Number.isFinite(Number(locationQuery.data.latitude))
      ? Number(locationQuery.data.latitude)
      : null;
  const driverLng =
    locationQuery.data?.longitude != null && Number.isFinite(Number(locationQuery.data.longitude))
      ? Number(locationQuery.data.longitude)
      : null;

  const mapHtml = useMemo(
    () =>
      buildLeafletHtml(
        deliveryLat,
        deliveryLng,
        driverLat,
        driverLng,
        locationQuery.data?.driverName ?? "Driver",
      ),
    [deliveryLat, deliveryLng, driverLat, driverLng, locationQuery.data?.driverName],
  );

  const statusLabel =
    driverLat != null && driverLng != null
      ? locationQuery.data?.locationSource === "realtime"
        ? "Live GPS"
        : "Driver location"
      : "Delivery location";

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="map-marker-radius" size={18} color={theme.colors.primary} />
        <Text style={styles.title}>Live tracking</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{statusLabel}</Text>
        </View>
      </View>

      {locationQuery.isLoading && !locationQuery.data ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.hint}>Loading map…</Text>
        </View>
      ) : (
        <View style={styles.mapBox}>
          <WebView
            key={`map-${driverLat ?? "d"}-${driverLng ?? "d"}-${deliveryLat}-${deliveryLng}`}
            originWhitelist={["*"]}
            source={{ html: mapHtml }}
            style={styles.webview}
            scrollEnabled={false}
            nestedScrollEnabled
          />
        </View>
      )}

      {locationQuery.data?.driverName ? (
        <Text style={styles.meta}>
          Driver: {locationQuery.data.driverName}
          {locationQuery.data.lastUpdate
            ? ` · Updated ${new Date(locationQuery.data.lastUpdate).toLocaleTimeString("en-ZA", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
        </Text>
      ) : locationQuery.isError ? (
        <Text style={styles.hint}>Driver GPS will appear once tracking starts. Delivery point is shown on the map.</Text>
      ) : null}
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    wrap: {
      marginTop: 12,
      gap: 8,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    title: {
      flex: 1,
      fontWeight: "700",
      fontSize: 15,
      color: theme.colors.onSurface,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: theme.colors.primaryContainer,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.colors.primary,
    },
    mapBox: {
      height: 220,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    webview: {
      flex: 1,
      backgroundColor: "transparent",
    },
    loadingBox: {
      height: 220,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.colors.surface,
    },
    hint: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      textAlign: "center",
      paddingHorizontal: 8,
    },
    meta: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
  });
