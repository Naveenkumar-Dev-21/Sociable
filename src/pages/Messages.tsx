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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Send, MessageCircle, ArrowLeft, Users, RefreshCw } from "lucide-react";

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
  follower_status?: 'following' | 'follower' | 'mutual' | 'none';
}

interface Follower {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  follower_status: 'following' | 'follower' | 'mutual' | 'none';
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
  const [followers, setFollowers] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [followersList, setFollowersList] = useState<Follower[]>([]);
  const [activeTab, setActiveTab] = useState<'conversations' | 'followers'>('conversations');
  const [refreshingFollowers, setRefreshingFollowers] = useState(false);
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

  useEffect(() => {
    // Auto-refresh followers list when switching to followers tab
    if (activeTab === 'followers' && followersList.length === 0 && (following.length > 0 || followers.length > 0)) {
      console.log("Switched to followers tab and no followers shown, refreshing...");
      refreshFollowersList();
    }
  }, [activeTab]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user || !session.user.id) {
      navigate("/");
      return;
    }
    setUser(session.user);
    await fetchFollowerData(session.user.id);
    fetchConversations();
  };

  const fetchFollowerData = async (userId: string) => {
    try {
      // Get users I follow
      const { data: followingData, error: followingError } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId);

      if (followingError) {
        console.error("Error fetching following data:", followingError);
      }

      // Get users who follow me
      const { data: followersData, error: followersError } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", userId);

      if (followersError) {
        console.error("Error fetching followers data:", followersError);
      }

      const followingIds = followingData?.map(f => f.following_id) || [];
      const followerIds = followersData?.map(f => f.follower_id) || [];

      console.log("Following IDs:", followingIds);
      console.log("Follower IDs:", followerIds);

      setFollowing(followingIds);
      setFollowers(followerIds);

      // Fetch followers with profile information
      if (followingIds.length > 0 || followerIds.length > 0) {
        await fetchFollowersList(followingIds, followerIds, []);
      } else {
        console.log("No followers found, setting empty list");
        setFollowersList([]);
      }
    } catch (error) {
      console.error("Error fetching follower data:", error);
      setFollowersList([]);
    }
  };

  const fetchFollowersList = async (followingIds: string[], followerIds: string[], existingConversationUserIds?: string[]) => {
    if (!user?.id) {
      console.log("No user ID in fetchFollowersList");
      return;
    }

    console.log("fetchFollowersList called with:", { followingIds, followerIds, existingConversationUserIds });

    try {
      // Get all users I can message (followers + following)
      const allUserIds = [...new Set([...followingIds, ...followerIds])];

      console.log("All user IDs to fetch:", allUserIds);

      if (allUserIds.length === 0) {
        console.log("No user IDs found, setting empty followers list");
        setFollowersList([]);
        return;
      }

      // Get profile information for all followers/following
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", allUserIds);

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        console.error("User IDs that failed:", allUserIds);
        setFollowersList([]);
        return;
      }

      console.log("Fetched profiles:", profiles);
      console.log("Looking for user IDs:", allUserIds);

      if (!profiles || profiles.length === 0) {
        console.log("No profiles found for user IDs:", allUserIds);
        console.log("This might indicate that the follower relationships exist but profiles don't");

        // Try to fetch just one profile to test if the issue is with the query or data
        if (allUserIds.length > 0) {
          const { data: testProfile } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url")
            .eq("id", allUserIds[0])
            .single();

          console.log("Test profile query result:", testProfile);

          // If we can fetch individual profiles but not in bulk, create fallback list
          if (testProfile) {
            console.log("Individual profile fetch works, creating fallback list");
            const fallbackFollowers = allUserIds.map(id => ({
              id,
              username: `User ${id.substring(0, 8)}`,
              full_name: `User ${id.substring(0, 8)}`,
              avatar_url: null,
              follower_status: 'following' as const
            }));
            setFollowersList(fallbackFollowers);
            return;
          }
        }

        setFollowersList([]);
        return;
      }

      // Filter out users who already have conversations (if provided)
      const conversationUserIds = existingConversationUserIds || [];
      console.log("Conversation user IDs to filter out:", conversationUserIds);

      // For debugging, let's show all followers first, then filter
      const allFollowers = profiles.map(profile => {
        let followerStatus: 'following' | 'follower' | 'mutual' | 'none' = 'none';
        if (followingIds.includes(profile.id) && followerIds.includes(profile.id)) {
          followerStatus = 'mutual';
        } else if (followingIds.includes(profile.id)) {
          followerStatus = 'following';
        } else if (followerIds.includes(profile.id)) {
          followerStatus = 'follower';
        }

        return {
          ...profile,
          follower_status: followerStatus,
        };
      });

      console.log("All followers before filtering:", allFollowers);

      const availableFollowers = allFollowers
        .filter(profile => !conversationUserIds.includes(profile.id));

      console.log("Available followers after filtering:", availableFollowers);

      // If filtering removed all followers but we have followers, show them anyway
      // This handles cases where conversation detection fails
      if (availableFollowers.length === 0 && allFollowers.length > 0) {
        console.log("No followers after filtering but we have followers, showing all");
        setFollowersList(allFollowers);
      } else if (availableFollowers.length === 0 && allFollowers.length === 0 && (followingIds.length > 0 || followerIds.length > 0)) {
        console.log("No followers found but we have relationships, this indicates a data issue");
        // Create placeholder followers for users that exist in relationships but not in profiles
        const placeholderFollowers = allUserIds.map((id, index) => ({
          id,
          username: `User ${id.substring(0, 8)}`,
          full_name: `User ${id.substring(0, 8)}`,
          avatar_url: null,
          follower_status: (index % 2 === 0 ? 'following' : 'follower') as 'following' | 'follower'
        }));
        setFollowersList(placeholderFollowers);
      } else {
        setFollowersList(availableFollowers);
      }

      // The fallback logic is now handled above in the main filtering logic
    } catch (error) {
      console.error("Error fetching followers list:", error);
      setFollowersList([]);
    }
  };

  const fetchConversations = async () => {
    if (!user?.id) {
      console.log("No user ID available");
      return;
    }

    console.log("Fetching conversations for user:", user.id);

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
        .or(`participant_1_id.eq.${user.id},participant_2_id.eq.${user.id}`)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching conversations:", error);
        throw error;
      }

      console.log("Raw conversations data:", data);

      // Get all conversations first, then determine follower status for each
      const allConversations = data || [];

      // For existing conversations, check if there's a follower relationship
      // If no follower relationship exists, still show the conversation but mark as 'none'
      const conversationsWithFollowerStatus = allConversations.map(conv => {
        const otherUserId = conv.participant_1_id === user.id
          ? conv.participant_2_id
          : conv.participant_1_id;

        // Check if there's a follower relationship
        const hasFollowerRelationship = followers.includes(otherUserId) || following.includes(otherUserId);

        // If no follower relationship exists, still show the conversation for existing chats
        // This handles cases where users followed each other before the follower-based messaging was implemented
        if (!hasFollowerRelationship) {
          console.log(`Showing existing conversation with ${otherUserId} even though no follower relationship exists`);
        }

        return {
          ...conv,
          shouldShow: true // Show all existing conversations
        };
      });

      // Show all conversations for now to fix the immediate issue
      // This handles cases where users followed each other before the follower-based messaging was implemented
      const filteredConversations = allConversations;

      console.log("Filtered conversations count:", filteredConversations.length);

      // Get other user info for each conversation
      const conversationsWithUsers = await Promise.all(
        filteredConversations.map(async (conv) => {
          const otherUserId = conv.participant_1_id === user.id
            ? conv.participant_2_id
            : conv.participant_1_id;

          const { data: otherUser } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url")
            .eq("id", otherUserId)
            .single();

          const lastMessage = conv.messages?.[0] || null;

          // Determine follower status
          let followerStatus: 'following' | 'follower' | 'mutual' | 'none' = 'none';
          if (following.includes(otherUserId) && followers.includes(otherUserId)) {
            followerStatus = 'mutual';
          } else if (following.includes(otherUserId)) {
            followerStatus = 'following';
          } else if (followers.includes(otherUserId)) {
            followerStatus = 'follower';
          }
          // If no follower relationship, still show the conversation for existing chats

          return {
            ...conv,
            other_user: otherUser,
            last_message: lastMessage,
            follower_status: followerStatus,
          };
        })
      );

      setConversations(conversationsWithUsers);

      // Refresh followers list after conversations are loaded
      if (following.length > 0 || followers.length > 0) {
        // Get current conversation user IDs to filter out users who already have conversations
        const currentConversationUserIds = conversationsWithUsers.map(conv => {
          return conv.participant_1_id === user.id
            ? conv.participant_2_id
            : conv.participant_1_id;
        });

        console.log("Current conversation user IDs:", currentConversationUserIds);

        // Pass current conversation user IDs to filter them out
        await fetchFollowersList(following, followers, currentConversationUserIds);
      }
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

  const getFollowerStatusIcon = (status: string) => {
    switch (status) {
      case 'mutual':
        return <Users className="w-3 h-3 text-green-500" />;
      case 'following':
        return <Users className="w-3 h-3 text-blue-500" />;
      case 'follower':
        return <Users className="w-3 h-3 text-purple-500" />;
      default:
        return null;
    }
  };

  const refreshFollowersList = async () => {
    if (!user?.id) return;

    setRefreshingFollowers(true);
    try {
      console.log("Manual refresh of followers list");
      await fetchFollowerData(user.id);
    } catch (error) {
      console.error("Error refreshing followers:", error);
    } finally {
      setRefreshingFollowers(false);
    }
  };

  const startConversation = async (otherUserId: string) => {
    if (!user) return;

    // Check if there's already a conversation
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .or(`and(participant_1_id.eq.${user.id},participant_2_id.eq.${otherUserId}),and(participant_1_id.eq.${otherUserId},participant_2_id.eq.${user.id})`)
      .maybeSingle();

    if (existingConv) {
      // Load existing conversation
      const conversation = conversations.find(c => c.id === existingConv.id);
      if (conversation) {
        setSelectedConversation(conversation);
        setActiveTab('conversations');
      }
      return;
    }

    // Check follower relationship before creating new conversation
    if (!followers.includes(otherUserId) && !following.includes(otherUserId)) {
      toast({
        title: "Cannot start conversation",
        description: "You can only message users you follow or who follow you.",
        variant: "destructive",
      });
      return;
    }

    // Create new conversation
    try {
      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({
          participant_1_id: user.id,
          participant_2_id: otherUserId,
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh conversations list
      fetchConversations();

      // Select the new conversation
      const conversation = conversations.find(c => c.id === newConv.id);
      if (conversation) {
        setSelectedConversation(conversation);
        setActiveTab('conversations');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
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
          {/* Conversations and Followers List */}
          <Card className="lg:col-span-1 glass border-white/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Messages
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshFollowersList}
                  disabled={refreshingFollowers}
                >
                  {refreshingFollowers ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'conversations' | 'followers')}>
                <TabsList className="grid w-full grid-cols-2 mx-4 mb-4">
                  <TabsTrigger value="conversations">
                    Conversations ({conversations.length})
                  </TabsTrigger>
                  <TabsTrigger value="followers">
                    Start Chat ({followersList.length})
                    {refreshingFollowers && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="conversations" className="mt-0">
                  <ScrollArea className="h-[calc(100vh-18rem)]">
                    {conversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={`p-4 cursor-pointer hover:bg-accent/50 transition-colors border-b ${
                          selectedConversation?.id === conversation.id ? "bg-accent" : ""
                        }`}
                        onClick={() => setSelectedConversation(conversation)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="w-12 h-12">
                              <AvatarImage src={conversation.other_user?.avatar_url} />
                              <AvatarFallback>
                                {conversation.other_user?.username?.charAt(0).toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            {conversation.follower_status && (
                              <div className="absolute -bottom-1 -right-1">
                                {getFollowerStatusIcon(conversation.follower_status)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="font-semibold truncate">
                                {conversation.other_user?.username}
                              </h3>
                              <div className="flex items-center gap-1">
                                {conversation.follower_status && getFollowerStatusIcon(conversation.follower_status)}
                                {conversation.last_message && (
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(conversation.last_message.created_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
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
                        <p className="text-muted-foreground mb-2">No conversations yet</p>
                        <p className="text-sm text-muted-foreground">
                          Check your followers to start messaging
                        </p>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="followers" className="mt-0">
                  <ScrollArea className="h-[calc(100vh-18rem)]">
                    {followersList.map((follower) => (
                      <div
                        key={follower.id}
                        className="p-4 cursor-pointer hover:bg-accent/50 transition-colors border-b"
                        onClick={() => startConversation(follower.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="w-12 h-12">
                              <AvatarImage src={follower.avatar_url} />
                              <AvatarFallback>
                                {follower.username?.charAt(0).toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-1 -right-1">
                              {getFollowerStatusIcon(follower.follower_status)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="font-semibold truncate">
                                {follower.username}
                              </h3>
                              <div className="flex items-center gap-1">
                                {getFollowerStatusIcon(follower.follower_status)}
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {follower.full_name}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {followersList.length === 0 && !loading && (
                      <div className="text-center py-12">
                        <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground mb-2">
                          {following.length === 0 && followers.length === 0
                            ? "No followers to message"
                            : "No followers available to start new chats"
                          }
                        </p>
                        <p className="text-sm text-muted-foreground mb-2">
                          {following.length === 0 && followers.length === 0
                            ? "Follow other users to start conversations"
                            : "All your followers already have conversations"
                          }
                        </p>
                        <p className="text-xs text-muted-foreground mb-4">
                          Following: {following.length} | Followers: {followers.length}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={refreshFollowersList}
                          disabled={refreshingFollowers}
                        >
                          {refreshingFollowers ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <RefreshCw className="w-4 h-4 mr-2" />
                          )}
                          Refresh List
                        </Button>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
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
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={selectedConversation.other_user?.avatar_url} />
                        <AvatarFallback>
                          {selectedConversation.other_user?.username?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      {selectedConversation.follower_status && (
                        <div className="absolute -bottom-1 -right-1">
                          {getFollowerStatusIcon(selectedConversation.follower_status)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">
                          {selectedConversation.other_user?.username}
                        </h3>
                        {selectedConversation.follower_status && getFollowerStatusIcon(selectedConversation.follower_status)}
                      </div>
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
                    Choose a conversation from your followers to start messaging
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