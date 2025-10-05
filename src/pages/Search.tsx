import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search as SearchIcon, Users, FileText, Heart, MessageCircle, Calendar } from "lucide-react";

interface User {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  bio: string;
  is_private: boolean;
}

interface Post {
  id: string;
  caption: string;
  media_url: string;
  media_type: string;
  created_at: string;
  user_id: string;
  profiles: {
    username: string;
    avatar_url: string;
    full_name: string;
  };
  likes: { id: string }[];
  comments: { id: string }[];
}

const Search = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/");
      return;
    }
    setUser(session.user);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    try {
      // Search users
      const { data: usersData, error: usersError } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
        .eq("is_private", false)
        .limit(20);

      if (usersError) throw usersError;
      setUsers(usersData || []);

      // Search posts
      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select(`
          id,
          caption,
          media_url,
          media_type,
          created_at,
          user_id,
          profiles!posts_user_id_fkey (
            username,
            avatar_url,
            full_name
          ),
          likes (id),
          comments (id)
        `)
        .or(`caption.ilike.%${searchQuery}%`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (postsError) throw postsError;
      setPosts(postsData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Card className="mb-8 glass border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SearchIcon className="w-5 h-5" />
              Search Users & Posts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Search for users or posts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={searchLoading}>
                {searchLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <SearchIcon className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Users ({users.length})
            </TabsTrigger>
            <TabsTrigger value="posts" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Posts ({posts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6">
            <div className="grid gap-4">
              {users.map((user) => (
                <Card key={user.id} className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => navigate(`/profile/${user.username}`)}>
                  <div className="flex items-center gap-4">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={user.avatar_url} />
                      <AvatarFallback>
                        {user.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{user.username}</h3>
                        {user.is_private && <Badge variant="secondary">Private</Badge>}
                      </div>
                      {user.full_name && (
                        <p className="text-sm text-muted-foreground mb-2">{user.full_name}</p>
                      )}
                      {user.bio && (
                        <p className="text-sm">{user.bio}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}

              {users.length === 0 && !searchLoading && (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No users found</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="posts" className="mt-6">
            <div className="grid gap-4">
              {posts.map((post) => (
                <Card key={post.id} className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => navigate(`/profile/${post.profiles.username}`)}>
                  <div className="flex gap-4">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={post.profiles.avatar_url} />
                      <AvatarFallback>
                        {post.profiles.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{post.profiles.username}</h4>
                        <span className="text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3 inline mr-1" />
                          {new Date(post.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      {post.caption && (
                        <p className="mb-3">{post.caption}</p>
                      )}

                      {post.media_type === "image" ? (
                        <img
                          src={post.media_url}
                          alt="Post"
                          className="w-full max-w-md rounded-lg"
                        />
                      ) : (
                        <video
                          src={post.media_url}
                          className="w-full max-w-md rounded-lg"
                          controls
                        />
                      )}

                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-1">
                          <Heart className="w-4 h-4" />
                          <span className="text-sm">{post.likes.length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageCircle className="w-4 h-4" />
                          <span className="text-sm">{post.comments.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}

              {posts.length === 0 && !searchLoading && (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No posts found</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Search;