import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Bell,
  UserPlus,
  MessageCircle,
  Heart,
  Check,
  X,
  Users,
  Clock
} from "lucide-react";

interface Notification {
  id: string;
  type: string;
  from_user_id: string;
  to_user_id: string;
  message?: string;
  is_read: boolean;
  created_at: string;
  from_user?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
  };
  related_post_id?: string;
  related_conversation_id?: string;
}

const Notifications = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchNotifications();

      // Subscribe to new notifications
      const channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `to_user_id=eq.${user.id}`,
          },
          () => {
            fetchNotifications();
          }
        )
        .subscribe();
    }
  }, [user]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user || !session.user.id) {
      navigate("/");
      return;
    }
    setUser(session.user);
  };

  const fetchNotifications = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id,
          type,
          from_user_id,
          to_user_id,
          message,
          is_read,
          created_at,
          related_post_id,
          related_conversation_id
        `)
        .eq('to_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Get unique from_user_ids to fetch profile data
      const fromUserIds = [...new Set(data?.map(n => n.from_user_id) || [])];

      let fromUsersData: any = {};
      if (fromUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', fromUserIds);

        fromUsersData = profiles?.reduce((acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        }, {} as any) || {};
      }

      // Combine notifications with user data
      const notificationsWithUsers = data?.map(notification => ({
        ...notification,
        from_user: fromUsersData[notification.from_user_id]
      })) || [];

      if (error) throw error;

      setNotifications(notificationsWithUsers);
      setUnreadCount(notificationsWithUsers.filter(n => !n.is_read).length);
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

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('to_user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleFollowRequest = async (notification: Notification, accept: boolean) => {
    if (!user?.id) return;

    try {
      if (accept) {
        // Accept follow request - create follow relationship
        await supabase
          .from('follows')
          .insert({
            follower_id: notification.from_user_id,
            following_id: user.id
          });

        // Update notification message
        await supabase
          .from('notifications')
          .update({
            type: 'follow_accepted',
            message: `${user.user_metadata?.full_name || user.email} accepted your follow request`
          })
          .eq('id', notification.id);

        toast({
          title: "Follow request accepted",
          description: `You are now following ${notification.from_user?.username}`,
        });
      } else {
        // Reject follow request - just update notification
        await supabase
          .from('notifications')
          .update({
            type: 'follow_rejected',
            message: `${user.user_metadata?.full_name || user.email} declined your follow request`
          })
          .eq('id', notification.id);

        toast({
          title: "Follow request declined",
          description: `Follow request from ${notification.from_user?.username} was declined`,
        });
      }

      // Refresh notifications
      fetchNotifications();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'follow_request':
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'follow_accepted':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'new_message':
        return <MessageCircle className="w-4 h-4 text-purple-500" />;
      case 'like':
        return <Heart className="w-4 h-4 text-red-500" />;
      case 'comment':
        return <MessageCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const notificationDate = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - notificationDate.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return notificationDate.toLocaleDateString();
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Card className="glass border-white/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notifications
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {unreadCount}
                  </Badge>
                )}
              </CardTitle>
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={markAllAsRead}>
                  Mark all as read
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-12rem)]">
              {notifications.length === 0 && !loading ? (
                <div className="text-center py-12">
                  <Bell className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No notifications yet</h3>
                  <p className="text-muted-foreground">
                    You'll see notifications here when people interact with you
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-accent/50 transition-colors ${
                        !notification.is_read ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                      }`}
                      onClick={() => !notification.is_read && markAsRead(notification.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          {getNotificationIcon(notification.type)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2 mb-1">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={notification.from_user?.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {notification.from_user?.username?.charAt(0).toUpperCase() || "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm">
                                  <span className="font-semibold">
                                    {notification.from_user?.username}
                                  </span>
                                  {' '}
                                  {notification.message}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Clock className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">
                                    {formatTimeAgo(notification.created_at)}
                                  </span>
                                  {!notification.is_read && (
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Action buttons for follow requests */}
                            {notification.type === 'follow_request' && (
                              <div className="flex gap-2 ml-4">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFollowRequest(notification, true);
                                  }}
                                  className="text-green-600 border-green-200 hover:bg-green-50"
                                >
                                  <Check className="w-3 h-3 mr-1" />
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFollowRequest(notification, false);
                                  }}
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Decline
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Notifications;