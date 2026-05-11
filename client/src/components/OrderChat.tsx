import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, MessageCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Message {
  id: string;
  threadId: string;
  senderId: string;
  senderType: "customer" | "driver";
  messageType: "text" | "image" | "location";
  message: string;
  attachmentUrl: string | null;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
  senderName: string;
}

interface ChatThread {
  id: string;
  orderId: string;
  customerId: string;
  driverId: string;
  lastMessageAt: Date | null;
  createdAt: Date;
}

interface OrderChatProps {
  orderId: string;
  currentUserType: "customer" | "driver";
  /** Parent already shows a section title (e.g. driver order card "Messages"). */
  variant?: "default" | "embedded";
}

export function OrderChat({ orderId, currentUserType, variant = "default" }: OrderChatProps) {
  const [messageText, setMessageText] = useState("");
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollMessagesToBottom = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  // Get or create chat thread
  const {
    data: thread,
    isLoading: threadLoading,
    isError: threadError,
  } = useQuery<ChatThread>({
    queryKey: ["/api/chat/thread", orderId],
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Get messages for the thread
  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/chat/messages", thread?.id],
    enabled: !!thread?.id,
    refetchInterval: 5000, // Poll every 5 seconds for new messages
  });

  // Mark messages as read when component mounts or new messages arrive
  const markAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!thread?.id) return;
      await apiRequest("POST", "/api/chat/messages/read", {
        threadId: thread.id,
      });
    },
  });

  // Auto-mark messages as read when viewing
  useEffect(() => {
    if (thread?.id && messages.length > 0) {
      markAsReadMutation.mutate();
    }
  }, [thread?.id, messages.length]);

  // Keep view pinned to latest messages (native scroll container; runs after layout)
  useLayoutEffect(() => {
    if (messagesLoading) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      scrollMessagesToBottom();
    };
    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    return () => {
      cancelled = true;
    };
  }, [messages, messagesLoading, scrollMessagesToBottom]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!thread?.id) {
        throw new Error("No chat thread available");
      }
      return apiRequest("POST", "/api/chat/messages", {
        threadId: thread.id,
        message,
        messageType: "text",
      });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", thread?.id] });
      toast({
        title: "Message sent",
        description: "Your message has been delivered",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to send message",
        description: error.message,
      });
    },
  });

  const handleSend = () => {
    if (!messageText.trim()) return;
    sendMessageMutation.mutate(messageText);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (threadLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (threadError || !thread) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Chat not available</p>
        <p className="text-sm mt-1">Chat will be available once a driver is assigned</p>
      </div>
    );
  }

  const embedded = variant === "embedded";

  return (
    <div
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col"
          : "flex h-full min-h-[500px] flex-col"
      }
    >
      {variant === "default" && (
        <div className="flex items-center gap-2 mb-4 pb-3 border-b">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Order Chat</h3>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={messagesScrollRef}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 overscroll-y-contain",
            !embedded && "min-h-[280px]",
          )}
          aria-label="Message list"
        >
          {messagesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No messages yet</p>
              <p className="text-sm mt-1">Start the conversation!</p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {messages.map((msg) => {
                const isOwnMessage = msg.senderType === currentUserType;
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}
                    data-testid={`message-${msg.id}`}
                  >
                    <Avatar className="h-8 w-8 bg-primary/10 text-primary uppercase flex-shrink-0">
                      <AvatarFallback className="font-semibold text-xs">
                        {msg.senderType === "driver" ? "D" : "C"}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`flex flex-col gap-1 max-w-[75%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-foreground">
                          {isOwnMessage ? 'You' : msg.senderName}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </div>
                      <div 
                        className={`rounded-lg px-3 py-2 ${
                          isOwnMessage 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {msg.message}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-auto shrink-0 border-t pt-4">
          <div className="flex gap-2">
            <Input
              data-testid="input-chat-message"
              placeholder="Type a message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={sendMessageMutation.isPending}
              className="flex-1"
            />
            <Button
              data-testid="button-send-message"
              onClick={handleSend}
              disabled={!messageText.trim() || sendMessageMutation.isPending}
              size="icon"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
