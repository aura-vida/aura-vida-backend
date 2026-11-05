-- Create blogs table if not exists
CREATE TABLE IF NOT EXISTS public.blogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    practitioner_slug TEXT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    excerpt TEXT,
    category TEXT,
    tags TEXT[] DEFAULT '{}',
    featured_image TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;

-- Allow public read of published blogs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'blogs' AND policyname = 'Public can view published blogs'
    ) THEN
        CREATE POLICY "Public can view published blogs"
            ON public.blogs
            FOR SELECT
            USING (status = 'published');
    END IF;
END $$;

-- Insert or update the Anjali Sawlani Journal Article
INSERT INTO public.blogs (
    title,
    slug,
    category,
    excerpt,
    content,
    tags,
    featured_image,
    status,
    created_at,
    updated_at
)
VALUES (
    'No Emotion Is Too ‘Small’',
    'no-emotion-is-too-small',
    'Wisdom & Practice',
    'Anjali works with women, single parents and young adults. Here she shares what drew her to this work, what to expect from a first session, and one simple habit you can try tonight.',
    'Anjali works with women, single parents and young adults. Here she shares what drew her to this work, what to expect from a first session, and one simple habit you can try tonight.

## Why I do this work
My own journey drew me to this space. I was diagnosed with anxiety and depression about nine years ago. Seeing a doctor and being on medication wasn’t enough; it had to be a 360-degree approach. I experienced the benefits of therapy and regular sessions, and I began including overall wellbeing practices in my daily life.

I realised how many people must be experiencing the same and feeling extremely lonely in their journey. Many don’t ask for help, either because of the stigma or the cost, and in many cases both. Having the right person listen to you without judgement is key to recovery.

## What a safe space really means
A safe, non-judgemental space is one where a client can have their guard down. Confidentiality, and zero ‘talking at’ or simply offering advice, gives them room to speak freely. Clients should be able to hear their own thoughts in a space where they can speak without bias or judgement.

## Please don’t dismiss your emotions
When I look back, the journey from our twenties has been nothing short of a roller coaster. Life does not come with a manual, and everyone’s journey is unique. Knowing that we will feel heard and supported is actually the most important thing.

No emotion is too ‘small’. As a society, we have been asked to simply carry on and accept a lot of situations and emotions without actually sitting with them. So please, don’t dismiss yours. There is help available, and you do not need to wait for a crisis to reach out to a therapist.

## If you’re unsure about reaching out
That hesitation is absolutely normal. Simply accepting that you need to deal with something, and taking the smallest step, is a big win. I would say acceptance is the prime factor: yes, I do have an issue, and I want to take a step towards making it better. Making peace with it, rather than dismissing it and letting it fester, matters, because it will snowball and show up later.

For a first session, please come with zero expectations, from both yourself and me. Many people come looking for quick-fix solutions. The first session is for me to hear you out and understand a little about your background and history. It is also for you to gauge whether I will be the right fit for you.

## Try this tonight: a 10-minute mind declutter
One simple thing that can help declutter the mind is to sit with a pen and paper, or even digitally, at the end of the day.

1. Write a bit about your day. Even if it is just two lines. Good or bad. Get it out of your head and onto paper, your phone or your laptop, whichever you choose.
2. Make tomorrow’s to-do list. It doesn’t have to be anything big. Simple things like what you might eat for breakfast, what groceries you need to order, the phone call you have to make.
3. Tick them off, one by one. This gives a sense of accomplishment and small wins, and a little structure and meaning to the day.

## Moving forward with clarity
Healing is never a linear path. It takes time, and it does not mean you need to be happy every single day. It means you can now identify your emotions and be in control of your reactions to them. This helps not only your own mind, but also the people around you.

The one small shift would be to not react to everything. Be mindful, and sit with what may have upset or hurt you. Everything does not need solving or reacting to right away.

## About Anjali
Anjali Sawlani is a warm, compassionate Emotional Wellbeing and Positive Mindset Counsellor, offering a safe, non-judgemental space where you feel truly heard and supported. She works with women, single parents and young adults, helping them navigate anxiety, stress, low mood, grief, trauma and life transitions, with an approach that is empathetic, solution-focused and tailored to each person. Book a session with Anjali on Kuśala at kusala.in.

> This article is shared for awareness and is not a substitute for professional care. If you are in crisis, please reach out to a helpline or someone you trust.',
    ARRAY['Emotional Wellbeing', 'Mental Health', 'Mindfulness', 'Anxiety', 'Healing'],
    '/images/journal/anjali-sawlani.jpg',
    'published',
    now(),
    now()
)
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    category = EXCLUDED.category,
    excerpt = EXCLUDED.excerpt,
    content = EXCLUDED.content,
    tags = EXCLUDED.tags,
    featured_image = EXCLUDED.featured_image,
    status = EXCLUDED.status,
    updated_at = now();

