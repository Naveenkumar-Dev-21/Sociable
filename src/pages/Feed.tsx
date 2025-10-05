import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import PostCard from "@/components/PostCard";
import CreatePost from "@/components/CreatePost";
import { Loader2 } from "lucide-react";

interface Post {
  id: string;
  caption: string;
  media_url: string;
  media_type: string;
  created_at: string;
  profiles: {
    username: string;
    avatar_url: string;
  };
  likes: { id: string }[];
  comments: { id: string }[];
}

const Feed = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/");
        return;
      }
      setUser(session.user);
      fetchPosts();
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/");
      }
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select(`
          *,
          profiles:user_id (username, avatar_url),
          likes (id),
          comments (id)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load posts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel("posts-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "posts",
        },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation user={user} />
      
      <main className="max-w-2xl mx-auto px-4 py-8">
        <CreatePost onPostCreated={fetchPosts} />
        
        <div className="mt-8 space-y-6">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={user?.id} onUpdate={fetchPosts} />
          ))}
          
          {posts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No posts yet. Be the first to share!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Feed;
