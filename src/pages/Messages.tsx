import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, MessageCircle, ArrowLeft } from "lucide-react";

interface Conversation {
  id: string;
  participant_1_id: string;
  participant_2_id: string;
  created_at: string;
  updated_at: string;
  other_user: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
  };
  last_message?: {
    content: string;
    created_at: string;
    sender_id: string;
  };
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  is_read: boolean;
}

const Messages = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageChannelRef = useRef<any>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);

      // Unsubscribe from previous channel if exists
      if (messageChannelRef.current) {
        supabase.removeChannel(messageChannelRef.current);
      }

      // Subscribe to new channel
      const channel = supabase
        .channel(`messages:${selectedConversation.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${selectedConversation.id}`,
          },
          (payload) => {
            setMessages((prev) => [...prev, payload.new as Message]);
          }
        )
        .subscribe();

      messageChannelRef.current = channel;
    }

    return () => {
      if (messageChannelRef.current) {
        supabase.removeChannel(messageChannelRef.current);
        messageChannelRef.current = null;
      }
    };
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/");
      return;
    }
    setUser(session.user);
    fetchConversations();
  };

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id,
          participant_1_id,
          participant_2_id,
          created_at,
          updated_at,
          messages (
            content,
            created_at,
            sender_id
          )
        `)
        .or(`participant_1_id.eq.${user?.id},participant_2_id.eq.${user?.id}`)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Get other user info for each conversation
      const conversationsWithUsers = await Promise.all(
        (data || []).map(async (conv) => {
          const otherUserId = conv.participant_1_id === user?.id
            ? conv.participant_2_id
            : conv.participant_1_id;

          const { data: otherUser } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url")
            .eq("id", otherUserId)
            .single();

          const lastMessage = conv.messages?.[0] || null;

          return {
            ...conv,
            other_user: otherUser,
            last_message: lastMessage,
          };
        })
      );

      setConversations(conversationsWithUsers);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };


  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !user) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversation.id,
          sender_id: user.id,
          content: newMessage.trim(),
          message_type: "text",
        });

      if (error) throw error;
      setNewMessage("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation user={user} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-12rem)]">
          {/* Conversations List */}
          <Card className="lg:col-span-1 glass border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Messages
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-16rem)]">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`p-4 cursor-pointer hover:bg-accent/50 transition-colors border-b ${
                      selectedConversation?.id === conversation.id ? "bg-accent" : ""
                    }`}
                    onClick={() => setSelectedConversation(conversation)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={conversation.other_user?.avatar_url} />
                        <AvatarFallback>
                          {conversation.other_user?.username?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-semibold truncate">
                            {conversation.other_user?.username}
                          </h3>
                          {conversation.last_message && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(conversation.last_message.created_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {conversation.last_message && (
                          <p className="text-sm text-muted-foreground truncate">
                            {conversation.last_message.content}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {conversations.length === 0 && !loading && (
                  <div className="text-center py-12">
                    <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No conversations yet</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Messages Area */}
          <Card className="lg:col-span-2 glass border-white/10">
            {selectedConversation ? (
              <>
                <CardHeader className="border-b">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedConversation(null)}
                      className="lg:hidden"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={selectedConversation.other_user?.avatar_url} />
                      <AvatarFallback>
                        {selectedConversation.other_user?.username?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">
                        {selectedConversation.other_user?.username}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedConversation.other_user?.full_name}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0 flex flex-col h-[calc(100vh-16rem)]">
                  <ScrollArea className="flex-1 p-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`mb-4 ${
                          message.sender_id === user.id ? "text-right" : "text-left"
                        }`}
                      >
                        <div
                          className={`inline-block max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                            message.sender_id === user.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p>{message.content}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </ScrollArea>

                  <div className="p-4 border-t">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                        className="flex-1"
                      />
                      <Button onClick={sendMessage} disabled={sending || !newMessage.trim()}>
                        {sending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex items-center justify-center h-full">
                <div className="text-center">
                  <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Select a conversation</h3>
                  <p className="text-muted-foreground">
                    Choose a conversation from the list to start messaging
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Messages;