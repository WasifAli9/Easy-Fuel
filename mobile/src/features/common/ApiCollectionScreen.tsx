import { useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { appTheme } from "@/design/theme";

type ApiCollectionScreenProps = {
  title: string;
  subtitle: string;
  endpoint: string;
  emptyMessage: string;
  itemTitleKeys?: string[];
  itemSubtitleKeys?: string[];
  extraAction?: { label: string; onPress: () => void };
};

function readByPath(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const result = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, value);
  return typeof result === "string" || typeof result === "number" ? String(result) : undefined;
}

function pickFirstMatch(item: unknown, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readByPath(item, key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function ApiCollectionScreen({
  title,
  subtitle,
  endpoint,
  emptyMessage,
  itemTitleKeys = ["title", "name", "label", "id"],
  itemSubtitleKeys = ["status", "state", "email", "created_at"],
  extraAction,
}: ApiCollectionScreenProps) {
  const query = useQuery({
    queryKey: [endpoint],
    queryFn: async () => {
      const { data } = await apiClient.get(endpoint);
      if (Array.isArray(data)) {
        return data;
      }
      if (data && typeof data === "object") {
        const listCandidate = Object.values(data as Record<string, unknown>).find(Array.isArray);
        if (Array.isArray(listCandidate)) {
          return listCandidate;
        }
        // Support object-style endpoints like /profile or /subscription.
        return [data];
      }
      return [];
    },
    staleTime: 30_000,
  });

  const items = useMemo(() => query.data ?? [], [query.data]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
    >
      <Card style={styles.headerCard}>
        <Card.Content>
          <Text variant="headlineSmall">{title}</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {subtitle}
          </Text>
          {extraAction ? (
            <Button style={styles.headerButton} mode="contained-tonal" onPress={extraAction.onPress}>
              {extraAction.label}
            </Button>
          ) : null}
        </Card.Content>
      </Card>

      {query.isLoading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator />
        </View>
      ) : query.isError ? (
        <Card style={styles.errorCard}>
          <Card.Content>
            <Text variant="titleMedium">Could not load data</Text>
            <Text variant="bodySmall" style={styles.errorText}>
              {(query.error as Error)?.message ?? "Please try again."}
            </Text>
            <Button mode="contained" onPress={() => query.refetch()} style={styles.retryButton}>
              Retry
            </Button>
          </Card.Content>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <Card.Content>
            <Text variant="bodyMedium">{emptyMessage}</Text>
          </Card.Content>
        </Card>
      ) : (
        items.map((item, index) => (
          <Card key={`${endpoint}-${index}`} style={styles.itemCard}>
            <Card.Content>
              <Text variant="titleMedium">
                {pickFirstMatch(item, itemTitleKeys) ?? `Item ${index + 1}`}
              </Text>
              <Text variant="bodySmall" style={styles.itemSubtitle}>
                {pickFirstMatch(item, itemSubtitleKeys) ?? "Tap to view details"}
              </Text>
            </Card.Content>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appTheme.colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  headerCard: {
    backgroundColor: appTheme.colors.surface,
  },
  subtitle: {
    marginTop: 6,
    color: "#4B5563",
  },
  headerButton: {
    marginTop: 12,
    alignSelf: "flex-start",
  },
  centerWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  errorCard: {
    borderColor: appTheme.colors.error,
    borderWidth: 1,
  },
  errorText: {
    marginTop: 6,
    color: "#6B7280",
  },
  retryButton: {
    marginTop: 12,
    alignSelf: "flex-start",
  },
  itemCard: {
    backgroundColor: appTheme.colors.surface,
  },
  itemSubtitle: {
    marginTop: 4,
    color: "#6B7280",
  },
});
