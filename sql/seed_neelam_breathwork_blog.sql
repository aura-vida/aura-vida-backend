-- Insert or update the Neelam Chheda Breathwork Journal Article
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
    'Everything Is Connected to Your Breath',
    'everything-is-connected-to-your-breath',
    'Wisdom & Practice',
    'Neelam Chheda guides breathwork through all five elements. Here she shares how she found it, how the elements show up in the body, and what to expect from your sessions.',
    'Neelam Chheda guides breathwork through all five elements. Here she shares how she found it, how the elements show up in the body, and what to expect from your sessions.

## How I found breathwork
When my sister first told me about breathwork, I didn’t take her seriously. I thought it was just a modern name for some pranayam. But once I experienced it myself, there was no looking back.

## Five elements, five energy centres
We are primarily made of five elements, and each element corresponds to one chakra, or energy centre, in our body. Water, for example, corresponds to the Svadisthana chakra, and we are about 70% water.

Water loves to flow. In our being, the water element relates to emotions, creativity, vitality, abundance and more.

## What a session feels like
Experiences vary from person to person. Some people have more physical sensations, while others have more emotional ones. The same person can also have very different experiences in different sessions.

No prior experience is needed. Each time you take a session, your breathing mechanism opens up a little more.

To begin with, we recommend a few sessions at a short interval, such as once a week. Once you start breathing in well, we can space the sessions out. Think of it like being on a dose for something: at first the doses are higher, then we taper them down and keep it on a maintenance basis.

There are also a few practices you can do at home regularly, once they have been taught to you.

## What I wish people understood
Everything, and I mean everything, is connected to our breath.

Have you ever observed how you breathe in different situations? When you are angry, sad, scared, happy, in love? Your breath can tell a lot about your entire life. Working with the breath can align you with your true being and help dissolve what is holding you back.

I believe you can control your entire life if you can manage your own breath.

## About Neelam Chheda
Neelam Chheda is a breathwork guide who works with all five elements. Book a session with Neelam Chheda on Kuśala at kusala.in.

> This article is shared for awareness and is not a substitute for medical advice. If you have a medical condition or are pregnant, please check with your doctor before trying breathwork.',
    ARRAY['Breathwork', 'Pranayama', 'Holistic Healing', 'Five Elements', 'Mindfulness'],
    '/images/journal/neelam-chheda.jpg',
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

