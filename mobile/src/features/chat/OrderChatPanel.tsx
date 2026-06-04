import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { readableType } from "@/design/typography";
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

type ChatStyles = {
  messageRow: object;
  messageRowOwn: object;
  messageMeta: object;
  messageTime: object;
  messageBubble: object;
  messageBubbleOwn: object;
  messageBubblePeer: object;
};

function renderMessageBubble(item: ChatMessage, viewerRole: ChatViewerRole, styles: ChatStyles) {
  const own = isOwnMessage(item.senderType, viewerRole);
  return (
    <View key={item.id} style={[styles.messageRow, own ? styles.messageRowOwn : null]}>
      <Text style={styles.messageMeta}>
        {own ? "You" : peerLabel(item, viewerRole)}{" "}
        <Text style={styles.messageTime}>
          {new Date(item.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </Text>
      </Text>
      <Text style={[styles.messageBubble, own ? styles.messageBubbleOwn : styles.messageBubblePeer]}>{item.message}</Text>
    </View>
  );
}

export function OrderChatPanel({
  orderId,
  viewerRole,
  orderDetailLayout,
  maxChatHeight,
  onMessageInputFocus,
}: {
  orderId: string;
  viewerRole: ChatViewerRole;
  /** Styling aligned with order-detail sheet (messages header, bubbles, send control). */
  orderDetailLayout?: boolean;
  /** Caps message list height on order-detail modals (scales with screen). */
  maxChatHeight?: number;
  /** Parent ScrollView can scroll to end so the composer stays above the keyboard. */
  onMessageInputFocus?: () => void;
}) {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme, !!orderDetailLayout, maxChatHeight);
  const [messageText, setMessageText] = useState("");
  const queryClient = useQueryClient();

  const threadQuery = useQuery({
    queryKey: ["/api/chat/thread", orderId],
    queryFn: async () => {
      const res = await apiClient.get<ChatThread | null>(`/api/chat/thread/${orderId}`, {
        validateStatus: (s) => s === 200 || s === 400 || s === 404,
      });
      if (res.status === 200 && res.data) {
        return res.data;
      }
      return null;
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

  const scrollViewRef = useRef<ScrollView>(null);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const sortedMessages = useMemo(() => {
    const raw = messagesQuery.data ?? [];
    return [...raw].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [messagesQuery.data]);

  const scrollChatToEnd = useCallback(
    (animated: boolean) => {
      requestAnimationFrame(() => {
        if (orderDetailLayout) {
          scrollViewRef.current?.scrollToEnd({ animated });
        } else {
          flatListRef.current?.scrollToEnd({ animated });
        }
      });
    },
    [orderDetailLayout],
  );

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!threadQuery.data?.id || !messageText.trim()) return;
      await apiClient.post("/api/chat/messages", {
        threadId: threadQuery.data.id,
        message: messageText.trim(),
        messageType: "text",
      });
    },
    onSuccess: async () => {
      setMessageText("");
      await queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", threadQuery.data?.id] });
      scrollChatToEnd(true);
    },
  });

  if (threadQuery.isLoading) {
    return (
      <View style={styles.chatLoading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (threadQuery.isError) {
    return (
      <Text style={styles.chatError}>
        Could not load messages. Check your connection and try again.
      </Text>
    );
  }

  if (!threadQuery.data?.id) {
    return (
      <Text style={styles.chatEmpty}>
        {viewerRole === "customer"
          ? "Messages open once a driver accepts your offer. You can still review quotes above."
          : "No chat thread for this order yet."}
      </Text>
    );
  }

  if (messagesQuery.isLoading) {
    return (
      <View style={styles.chatLoading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.chatWrap}>
      {orderDetailLayout ? (
        <View style={styles.messagesHeaderRow}>
          <Text style={styles.messagesTitle}>Messages</Text>
          <Text style={styles.messagesToday}>Today</Text>
        </View>
      ) : (
        <Text variant="titleSmall" style={styles.chatTitle}>
          Messages
        </Text>
      )}
      {orderDetailLayout ? (
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          onContentSizeChange={() => {
            if (sortedMessages.length > 0) scrollChatToEnd(false);
          }}
        >
          {sortedMessages.length === 0 ? (
            <Text style={styles.chatEmpty}>No messages yet.</Text>
          ) : (
            sortedMessages.map((item) => renderMessageBubble(item, viewerRole, styles))
          )}
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          data={sortedMessages}
          keyExtractor={(item) => item.id}
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          ListEmptyComponent={<Text style={styles.chatEmpty}>No messages yet.</Text>}
          renderItem={({ item }) => renderMessageBubble(item, viewerRole, styles)}
          onContentSizeChange={() => {
            if (sortedMessages.length > 0) scrollChatToEnd(false);
          }}
        />
      )}
      <View style={styles.chatInputRow}>
        <TextInput
          mode="outlined"
          placeholder="Type a message..."
          value={messageText}
          onChangeText={setMessageText}
          style={styles.chatInput}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
          dense={orderDetailLayout}
          onFocus={() => {
            onMessageInputFocus?.();
            requestAnimationFrame(() => onMessageInputFocus?.());
          }}
        />
        <Button
          mode="contained"
          buttonColor={orderDetailLayout ? theme.colors.primaryContainer : theme.colors.primary}
          textColor={orderDetailLayout ? theme.colors.primary : theme.colors.onPrimary}
          style={orderDetailLayout ? styles.sendButtonDetail : undefined}
          labelStyle={orderDetailLayout ? styles.sendLabelDetail : undefined}
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

const getStyles = (theme: typeof lightTheme, orderDetailLayout: boolean, maxChatHeight?: number) => {
  const p = getPortalUiStyleDefs(theme);
  const chatListMax = orderDetailLayout ? (maxChatHeight ?? 320) : undefined;
  const chatListMin = orderDetailLayout ? Math.min(160, Math.max(120, chatListMax ?? 160)) : 120;
  return StyleSheet.create({
    chatWrap: {
      gap: orderDetailLayout ? 12 : 8,
      flex: orderDetailLayout ? undefined : 1,
      marginTop: orderDetailLayout ? 4 : 0,
    },
    messagesHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 2,
    },
    messagesTitle: {
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0.6,
      color: theme.colors.onSurface,
      textTransform: "uppercase",
    },
    messagesToday: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.onSurfaceVariant,
      textTransform: "uppercase",
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
      flex: orderDetailLayout ? undefined : 1,
      flexGrow: orderDetailLayout ? 0 : undefined,
      minHeight: chatListMin,
      maxHeight: chatListMax,
      borderRadius: orderDetailLayout ? 16 : 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.colors.outline,
      backgroundColor: orderDetailLayout ? theme.colors.surface : theme.colors.background,
      borderLeftWidth: orderDetailLayout ? 1 : 3,
      borderLeftColor: orderDetailLayout ? theme.colors.outline : theme.colors.primary,
    },
    chatListContent: {
      gap: 10,
      paddingBottom: 12,
      paddingHorizontal: 12,
      paddingTop: 12,
      ...(orderDetailLayout
        ? { flexGrow: 1, justifyContent: "flex-end" as const }
        : {}),
    },
    chatEmpty: {
      ...p.muted,
      textAlign: "center",
    },
    messageRow: {
      gap: 6,
      maxWidth: "100%",
    },
    messageRowOwn: {
      alignItems: "flex-end",
    },
    messageMeta: {
      ...readableType.label,
      color: theme.colors.onSurface,
    },
    messageTime: {
      ...readableType.caption,
      fontWeight: "500",
      color: theme.colors.onSurfaceVariant,
    },
    messageBubble: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      maxWidth: "92%",
      ...readableType.body,
      overflow: "hidden",
    },
    messageBubblePeer: {
      backgroundColor: theme.colors.surfaceVariant,
      color: theme.colors.onSurface,
    },
    messageBubbleOwn: {
      backgroundColor: theme.colors.primary,
      color: theme.colors.onPrimary,
    },
    chatInputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    chatInput: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: orderDetailLayout ? 12 : undefined,
    },
    sendButtonDetail: {
      borderRadius: 12,
      marginVertical: 0,
    },
    sendLabelDetail: {
      fontWeight: "700",
    },
  });
};
