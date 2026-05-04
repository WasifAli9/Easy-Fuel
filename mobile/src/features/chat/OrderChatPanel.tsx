import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Button, Text, TextInput } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

export type ChatViewerRole = "driver" | "customer";

type ChatThread = { id: string };
type ChatMessage = {
  id: string;
  senderType: "customer" | "driver";
  senderName?: string;
  message: string;
  createdAt: string;
};

function isOwnMessage(senderType: string, role: ChatViewerRole) {
  if (role === "driver") return senderType === "driver";
  return senderType === "customer";
}

function peerLabel(item: ChatMessage, role: ChatViewerRole) {
  if (role === "driver") return item.senderName || "Customer";
  return item.senderName || "Driver";
}

export function OrderChatPanel({ orderId, viewerRole }: { orderId: string; viewerRole: ChatViewerRole }) {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const [messageText, setMessageText] = useState("");
  const queryClient = useQueryClient();

  const threadQuery = useQuery({
    queryKey: ["/api/chat/thread", orderId],
    queryFn: async () => {
      const { data } = await apiClient.get<ChatThread>(`/api/chat/thread/${orderId}`);
      return data;
    },
    refetchInterval: 10_000,
  });

  const messagesQuery = useQuery({
    queryKey: ["/api/chat/messages", threadQuery.data?.id],
    enabled: !!threadQuery.data?.id,
    queryFn: async () => {
      const { data } = await apiClient.get<ChatMessage[]>(`/api/chat/messages/${threadQuery.data?.id}`);
      return data;
    },
    refetchInterval: 5_000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!threadQuery.data?.id || !messageText.trim()) return;
      await apiClient.post("/api/chat/messages", {
        threadId: threadQuery.data.id,
        message: messageText.trim(),
        messageType: "text",
      });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", threadQuery.data?.id] });
    },
  });

  if (threadQuery.isLoading || messagesQuery.isLoading) {
    return (
      <View style={styles.chatLoading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (threadQuery.isError) {
    return <Text style={styles.chatError}>Chat is not available for this order yet.</Text>;
  }

  return (
    <View style={styles.chatWrap}>
      <Text variant="titleSmall" style={styles.chatTitle}>
        Messages
      </Text>
      <FlatList
        data={messagesQuery.data ?? []}
        keyExtractor={(item) => item.id}
        style={styles.chatList}
        contentContainerStyle={styles.chatListContent}
        ListEmptyComponent={<Text style={styles.chatEmpty}>No messages yet.</Text>}
        renderItem={({ item }) => {
          const own = isOwnMessage(item.senderType, viewerRole);
          return (
            <View style={[styles.messageRow, own ? styles.messageRowOwn : null]}>
              <Text style={styles.messageMeta}>
                {own ? "You" : peerLabel(item, viewerRole)}{" "}
                {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <Text style={[styles.messageBubble, own ? styles.messageBubbleOwn : null]}>{item.message}</Text>
            </View>
          );
        }}
      />
      <View style={styles.chatInputRow}>
        <TextInput
          mode="outlined"
          placeholder="Type a message..."
          value={messageText}
          onChangeText={setMessageText}
          style={styles.chatInput}
        />
        <Button
          mode="contained"
          buttonColor={theme.colors.primary}
          textColor={theme.colors.onPrimary}
          onPress={() => sendMessageMutation.mutate()}
          loading={sendMessageMutation.isPending}
          disabled={!messageText.trim() || sendMessageMutation.isPending}
        >
          Send
        </Button>
      </View>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    chatWrap: {
      gap: 8,
      flex: 1,
    },
    chatTitle: {
      marginTop: 2,
      fontWeight: "600",
      color: theme.colors.onSurface,
    },
    chatLoading: {
      paddingVertical: 20,
      alignItems: "center",
    },
    chatError: {
      color: theme.colors.onSurfaceVariant,
    },
    chatList: {
      flex: 1,
      minHeight: 120,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      backgroundColor: theme.colors.background,
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.primary,
    },
    chatListContent: {
      gap: 8,
      paddingBottom: 8,
      paddingHorizontal: 8,
      paddingTop: 8,
    },
    chatEmpty: {
      ...p.muted,
      textAlign: "center",
    },
    messageRow: {
      gap: 4,
    },
    messageRowOwn: {
      alignItems: "flex-end",
    },
    messageMeta: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    messageBubble: {
      backgroundColor: theme.colors.surfaceVariant,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      maxWidth: "92%",
    },
    messageBubbleOwn: {
      backgroundColor: theme.colors.primary,
      color: theme.colors.onPrimary,
    },
    chatInputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    chatInput: {
      flex: 1,
      backgroundColor: theme.colors.surface,
    },
  });
};
