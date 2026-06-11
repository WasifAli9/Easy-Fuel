import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Card, Chip, Text } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { navigateFromNotificationPayload } from "@/services/notification-navigation";
import type { UserRole } from "@/navigation/types";

type RawNotification = Record<string, unknown>;

type AppNotification = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt?: string;
  data: Record<string, unknown>;
};

function normalizeNotification(raw: RawNotification): AppNotification {
  return {
    id: String(raw.id),
    title: String(raw.title ?? "Notification"),
    message: String(raw.message ?? ""),
    read: Boolean(raw.read ?? raw.isRead),
    createdAt: (raw.createdAt ?? raw.created_at) as string | undefined,
    data: (raw.data as Record<string, unknown>) ?? {},
  };
}

type PortalNotificationsScreenProps = {
  role: UserRole;
};

export function PortalNotificationsScreen({ role }: PortalNotificationsScreenProps) {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const rows = (await apiClient.get<RawNotification[]>("/api/notifications")).data ?? [];
      return rows.map(normalizeNotification);
    },
    refetchInterval: 8_000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => apiClient.patch(`/api/notifications/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => apiClient.patch("/api/notifications/read-all"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadCount = (notificationsQuery.data ?? []).filter((n) => !n.read).length;

  return (
    <View style={styles.container}>
      {unreadCount > 0 ? (
        <View style={styles.toolbar}>
          <Button
            mode="outlined"
            onPress={() => markAllReadMutation.mutate()}
            loading={markAllReadMutation.isPending}
            disabled={markAllReadMutation.isPending}
          >
            Mark all read
          </Button>
        </View>
      ) : null}
      {notificationsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={notificationsQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListEmptyComponent={<Text style={styles.empty}>No notifications.</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                if (!item.read) {
                  markReadMutation.mutate(item.id);
                }
                navigateFromNotificationPayload(role, {
                  ...item.data,
                  notificationId: item.id,
                });
              }}
            >
              <Card style={[styles.card, !item.read ? styles.cardUnread : null]}>
                <Card.Content>
                  <Text variant="titleSmall">{item.title}</Text>
                  <Text style={styles.meta}>{item.message || "-"}</Text>
                  <View style={styles.rowBetween}>
                    <Text style={styles.meta}>
                      {item.createdAt ? new Date(item.createdAt).toLocaleString("en-ZA") : ""}
                    </Text>
                    {!item.read ? (
                      <Button
                        mode="contained"
                        buttonColor={theme.colors.primary}
                        textColor={theme.colors.onPrimary}
                        onPress={() => markReadMutation.mutate(item.id)}
                        loading={markReadMutation.isPending}
                      >
                        Mark read
                      </Button>
                    ) : (
                      <Chip compact>
                        Read
                      </Chip>
                    )}
                  </View>
                </Card.Content>
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function getStyles(theme: typeof lightTheme) {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    toolbar: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
      alignItems: "flex-end",
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    content: { ...p.screenScrollContentCompact, paddingBottom: 24, gap: 10 },
    card: p.sectionCard,
    cardUnread: {
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },
    meta: { marginTop: 4, color: theme.colors.onSurfaceVariant },
    rowBetween: { ...p.rowBetween, marginTop: 8 },
    empty: { ...p.empty, paddingVertical: 24 },
  });
}
