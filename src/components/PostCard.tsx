import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Heart, MessageCircle, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

interface PostCardProps {
  post: any;
  currentUserId: string;
  onUpdate: () => void;
}

const PostCard = ({ post, currentUserId, onUpdate }: PostCardProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [isLiked, setIsLiked] = useState(
    post.likes?.some((like: any) => like.user_id === currentUserId) || false
  );

  const handleLike = async () => {
    try {
      if (isLiked) {
        await supabase
          .from("likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", currentUserId);
        setIsLiked(false);
      } else {
        await supabase
          .from("likes")
          .insert({ post_id: post.id, user_id: currentUserId });
        setIsLiked(true);
      }
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleComment = async () => {
    if (!comment.trim()) return;

    try {
      await supabase.from("comments").insert({
        post_id: post.id,
        user_id: currentUserId,
        content: comment,
      });

      setComment("");
      fetchComments();
      onUpdate();

      toast({
        title: "Comment posted",
        description: "Your comment has been added",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchComments = async () => {
    const { data } = await supabase
      .from("comments")
      .select(`
        *,
        profiles:user_id (username, avatar_url)
      `)
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });

    setComments(data || []);
  };

  const toggleComments = () => {
    if (!showComments) {
      fetchComments();
    }
    setShowComments(!showComments);
  };

  return (
    <Card className="overflow-hidden glass border-white/10 animate-fade-in hover-glow">
      <div className="p-4">
        <div
          className="flex items-center gap-3 mb-4 cursor-pointer"
          onClick={() => navigate(`/profile/${post.profiles.username}`)}
        >
          <Avatar className="border-2 border-primary">
            <AvatarImage src={post.profiles.avatar_url} />
            <AvatarFallback>
              {post.profiles.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{post.profiles.username}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
      </div>

      {post.media_type === "image" ? (
        <img
          src={post.media_url}
          alt="Post"
          className="w-full aspect-square object-cover"
        />
      ) : (
        <video src={post.media_url} controls className="w-full aspect-square object-cover" />
      )}

      <div className="p-4 space-y-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLike}
            className={isLiked ? "text-red-500" : ""}
          >
            <Heart className={`w-6 h-6 ${isLiked ? "fill-current" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleComments}>
            <MessageCircle className="w-6 h-6" />
          </Button>
        </div>

        <div>
          <p className="font-semibold mb-1">
            {post.likes?.length || 0} {post.likes?.length === 1 ? "like" : "likes"}
          </p>
          {post.caption && (
            <p>
              <span className="font-semibold mr-2">{post.profiles.username}</span>
              {post.caption}
            </p>
          )}
        </div>

        {showComments && (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-2">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={comment.profiles.avatar_url} />
                  <AvatarFallback>
                    {comment.profiles.username.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-semibold mr-2">{comment.profiles.username}</span>
                    {comment.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Add a comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleComment()}
          />
          <Button size="icon" onClick={handleComment} className="bg-primary hover:bg-primary/90">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default PostCard;
