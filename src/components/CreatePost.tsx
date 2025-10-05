import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, Loader2, X } from "lucide-react";

interface CreatePostProps {
  onPostCreated: () => void;
}

const CreatePost = ({ onPostCreated }: CreatePostProps) => {
  const { toast } = useToast();
  const [caption, setCaption] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image or video file",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select an image or video to share",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("media")
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase.from("posts").insert({
        user_id: user.id,
        caption,
        media_url: publicUrl,
        media_type: selectedFile.type.startsWith("image/") ? "image" : "video",
      });

      if (insertError) throw insertError;

      toast({
        title: "Success!",
        description: "Your post has been shared",
      });

      setCaption("");
      setSelectedFile(null);
      setPreviewUrl("");
      onPostCreated();
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

  return (
    <Card className="p-6 glass border-white/10 animate-fade-in">
      <div className="space-y-4">
        {previewUrl && (
          <div className="relative rounded-lg overflow-hidden">
            {selectedFile?.type.startsWith("image/") ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full max-h-96 object-cover"
              />
            ) : (
              <video src={previewUrl} controls className="w-full max-h-96" />
            )}
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2"
              onClick={() => {
                setSelectedFile(null);
                setPreviewUrl("");
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        <Textarea
          placeholder="What's on your mind?"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="min-h-[100px] resize-none"
        />

        <div className="flex gap-2">
          <label className="flex-1">
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full"
              type="button"
              onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
            >
              <ImagePlus className="w-4 h-4 mr-2" />
              Select Media
            </Button>
          </label>

          <Button
            onClick={handleSubmit}
            disabled={!selectedFile || uploading}
            className="bg-primary hover:bg-primary/90"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Share"
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default CreatePost;
