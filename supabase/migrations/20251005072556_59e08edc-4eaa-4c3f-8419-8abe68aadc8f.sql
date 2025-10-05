-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  is_private BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create posts table
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  caption TEXT,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create likes table
CREATE TABLE public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(user_id, post_id)
);

-- Create comments table
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create follows table
CREATE TABLE public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (is_private = false OR auth.uid() = id);

CREATE POLICY "Private profiles viewable by owner and followers"
  ON public.profiles FOR SELECT
  USING (
    is_private = true AND (
      auth.uid() = id OR
      EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = auth.uid()
        AND following_id = profiles.id
      )
    )
  );

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Posts policies
CREATE POLICY "Posts from public profiles are viewable by everyone"
  ON public.posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = posts.user_id
      AND profiles.is_private = false
    )
  );

CREATE POLICY "Posts from private profiles viewable by owner and followers"
  ON public.posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = posts.user_id
      AND profiles.is_private = true
      AND (
        profiles.id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.follows
          WHERE follower_id = auth.uid()
          AND following_id = profiles.id
        )
      )
    )
  );

CREATE POLICY "Users can create their own posts"
  ON public.posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
  ON public.posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
  ON public.posts FOR DELETE
  USING (auth.uid() = user_id);

-- Likes policies
CREATE POLICY "Likes are viewable by everyone"
  ON public.likes FOR SELECT
  USING (true);

CREATE POLICY "Users can create likes"
  ON public.likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own likes"
  ON public.likes FOR DELETE
  USING (auth.uid() = user_id);

-- Comments policies
CREATE POLICY "Comments are viewable by everyone"
  ON public.comments FOR SELECT
  USING (true);

CREATE POLICY "Users can create comments"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments"
  ON public.comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id);

-- Follows policies
CREATE POLICY "Follows are viewable by everyone"
  ON public.follows FOR SELECT
  USING (true);

CREATE POLICY "Users can create follows"
  ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete their own follows"
  ON public.follows FOR DELETE
  USING (auth.uid() = follower_id);

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for media
INSERT INTO storage.buckets (id, name, public) 
VALUES ('media', 'media', true);

-- Storage policies for media bucket
CREATE POLICY "Media files are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

CREATE POLICY "Authenticated users can upload media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can update their own media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'media' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create conversations table for messaging
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  participant_2_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(participant_1_id, participant_2_id),
  CHECK (participant_1_id != participant_2_id)
);

-- Create messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  is_read BOOLEAN DEFAULT false NOT NULL
);

-- Enable Row Level Security for messaging
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations policies
CREATE POLICY "Users can view their own conversations"
  ON public.conversations FOR SELECT
  USING (
    auth.uid() = participant_1_id OR
    auth.uid() = participant_2_id
  );

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    auth.uid() = participant_1_id OR
    auth.uid() = participant_2_id
  );

-- Messages policies
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND (conversations.participant_1_id = auth.uid() OR conversations.participant_2_id = auth.uid())
    )
  );

CREATE POLICY "Users can send messages in their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND (conversations.participant_1_id = auth.uid() OR conversations.participant_2_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (auth.uid() = sender_id);

-- Function to get or create conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_id UUID;
  current_user_id UUID := auth.uid();
BEGIN
  -- Get existing conversation
  SELECT c.id INTO conversation_id
  FROM public.conversations c
  WHERE (c.participant_1_id = current_user_id AND c.participant_2_id = other_user_id)
     OR (c.participant_1_id = other_user_id AND c.participant_2_id = current_user_id);

  -- Create new conversation if none exists
  IF conversation_id IS NULL THEN
    INSERT INTO public.conversations (participant_1_id, participant_2_id)
    VALUES (
      LEAST(current_user_id, other_user_id),
      GREATEST(current_user_id, other_user_id)
    )
    RETURNING id INTO conversation_id;
  END IF;

  RETURN conversation_id;
END;
$$;

-- Enable realtime for messaging
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Enable realtime for posts
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;