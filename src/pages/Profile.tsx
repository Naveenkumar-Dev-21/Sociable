import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, Grid3x3, Heart, MessageCircle, Settings, Camera, Upload, Lock, Globe } from "lucide-react";

interface Profile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  bio: string;
  is_private: boolean;
}

interface Post {
  id: string;
  media_url: string;
  media_type: string;
  likes: { id: string }[];
  comments: { id: string }[];
}

const Profile = () => {
  const navigate = useNavigate();
  const { username } = useParams();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editForm, setEditForm] = useState({
    username: "",
    full_name: "",
    bio: "",
    is_private: false,
  });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/");
        return;
      }
      setUser(session.user);
      fetchProfile();
    };

    checkAuth();
  }, [navigate, username]);

  const fetchProfile = async () => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      const { data: postsData } = await supabase
        .from("posts")
        .select(`
          id,
          media_url,
          media_type,
          likes (id),
          comments (id)
        `)
        .eq("user_id", profileData.id)
        .order("created_at", { ascending: false });

      setPosts(postsData || []);

      const { count: followersCount } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profileData.id);

      const { count: followingCount } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", profileData.id);

      setFollowersCount(followersCount || 0);
      setFollowingCount(followingCount || 0);

      if (user) {
        const { data: followData } = await supabase
          .from("follows")
          .select("id")
          .eq("follower_id", user.id)
          .eq("following_id", profileData.id)
          .maybeSingle();

        setIsFollowing(!!followData);
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

  const handleFollow = async () => {
    if (!user || !profile) return;

    try {
      if (isFollowing) {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", profile.id);
        setIsFollowing(false);
        setFollowersCount((prev) => prev - 1);
      } else {
        // Check if the profile is private
        if (profile.is_private) {
          // For private accounts, send a follow request notification
          await supabase
            .from("notifications")
            .insert({
              type: "follow_request",
              from_user_id: user.id,
              to_user_id: profile.id,
              message: `${user.user_metadata?.full_name || user.email} wants to follow you`
            });

          toast({
            title: "Follow request sent",
            description: "Your follow request has been sent to the user for approval",
          });
        } else {
          // For public accounts, follow immediately
          await supabase
            .from("follows")
            .insert({ follower_id: user.id, following_id: profile.id });
          setIsFollowing(true);
          setFollowersCount((prev) => prev + 1);

          // Send notification for public follow
          await supabase
            .from("notifications")
            .insert({
              type: "follow_accepted",
              from_user_id: user.id,
              to_user_id: profile.id,
              message: `${user.user_metadata?.full_name || user.email} started following you`
            });
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEditProfile = () => {
    if (!profile) return;
    setEditForm({
      username: profile.username,
      full_name: profile.full_name || "",
      bio: profile.bio || "",
      is_private: profile.is_private,
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: editForm.username,
          full_name: editForm.full_name,
          bio: editForm.bio,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      setProfile((prev) => prev ? { ...prev, ...editForm } : null);
      setIsEditModalOpen(false);
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile((prev) => prev ? { ...prev, avatar_url: publicUrl } : null);
      toast({
        title: "Success",
        description: "Avatar updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Profile not found</p>
      </div>
    );
  }

  const isOwnProfile = user?.id === profile.id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation user={user} />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Card className="p-8 glass border-white/10">
          <div className="flex items-start gap-8 mb-8">
            <div className="relative">
              <Avatar className="w-32 h-32 border-4 border-primary">
                <AvatarImage src={profile.avatar_url} />
                <AvatarFallback className="text-3xl">
                  {profile.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isOwnProfile && (
                <label className="absolute bottom-0 right-0 bg-primary rounded-full p-2 cursor-pointer hover:bg-primary/90 transition-colors">
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Camera className="w-4 h-4 text-white" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                <h1 className="text-2xl font-bold">{profile.username}</h1>
                {isOwnProfile ? (
                  <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Settings className="w-4 h-4 mr-2" />
                        Edit Profile
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Profile</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleUpdateProfile} className="space-y-4">
                        <div>
                          <Label htmlFor="username">Username</Label>
                          <Input
                            id="username"
                            value={editForm.username}
                            onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="full_name">Full Name</Label>
                          <Input
                            id="full_name"
                            value={editForm.full_name}
                            onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="bio">Bio</Label>
                          <Textarea
                            id="bio"
                            value={editForm.bio}
                            onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                            rows={3}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {editForm.is_private ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                            <Label htmlFor="privacy">Private Account</Label>
                          </div>
                          <Switch
                            id="privacy"
                            checked={editForm.is_private}
                            onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_private: checked }))}
                          />
                        </div>
                        <Button type="submit" className="w-full">
                          Update Profile
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button
                    onClick={handleFollow}
                    variant={isFollowing ? "outline" : "default"}
                    className={isFollowing ? "" : "bg-primary hover:bg-primary/90"}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </Button>
                )}
              </div>

              <div className="flex gap-8 mb-4">
                <div className="text-center">
                  <p className="font-bold text-xl">{posts.length}</p>
                  <p className="text-sm text-muted-foreground">Posts</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-xl">{followersCount}</p>
                  <p className="text-sm text-muted-foreground">Followers</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-xl">{followingCount}</p>
                  <p className="text-sm text-muted-foreground">Following</p>
                </div>
              </div>

              <div>
                <p className="font-semibold">{profile.full_name}</p>
                <p className="text-muted-foreground">{profile.bio}</p>
              </div>
            </div>
          </div>

          <Tabs defaultValue="posts" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="posts" className="flex-1">
                <Grid3x3 className="w-4 h-4 mr-2" />
                Posts
              </TabsTrigger>
              {isOwnProfile && (
                <TabsTrigger value="settings" className="flex-1">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="posts" className="mt-6">
              <div className="grid grid-cols-3 gap-2">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="aspect-square relative group cursor-pointer overflow-hidden rounded-lg"
                  >
                    {post.media_type === "image" ? (
                      <img
                        src={post.media_url}
                        alt="Post"
                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                      />
                    ) : (
                      <video
                        src={post.media_url}
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white">
                      <div className="flex items-center gap-1">
                        <Heart className="w-5 h-5" />
                        <span>{post.likes.length}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="w-5 h-5" />
                        <span>{post.comments.length}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {posts.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No posts yet</p>
                </div>
              )}
            </TabsContent>

            {isOwnProfile && (
              <TabsContent value="settings" className="mt-6">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Account Settings</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Email</p>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-2">
                        {profile?.is_private ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                        <div>
                          <p className="font-medium">Account Type</p>
                          <p className="text-sm text-muted-foreground">
                            {profile?.is_private ? "Private Account" : "Public Account"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          await supabase.auth.signOut();
                          navigate("/");
                        }}
                        className="w-full"
                      >
                        Sign Out
                      </Button>
                    </div>
                  </div>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </Card>
      </main>
    </div>
  );
};

export default Profile;
