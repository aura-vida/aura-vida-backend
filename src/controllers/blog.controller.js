import * as blogModel from '../models/blog.model.js';

export const listBlogs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const result = await blogModel.listBlogs(page, limit);
        res.status(200).json(result);
    } catch (error) {
        console.error('listBlogs error:', error);
        res.status(500).json({ error: error.message || 'Failed to list blogs' });
    }
};

export const getBlogBySlug = async (req, res) => {
    try {
        const data = await blogModel.getBlogBySlug(req.params.slug);
        res.status(200).json(data);
    } catch (error) {
        const status = error.code === 'PGRST116' ? 404 : (error.statusCode || 500);
        res.status(status).json({ error: status === 404 ? 'Blog not found' : (error.message || 'Failed to get blog') });
    }
};

export const createBlog = async (req, res) => {
    try {
        const { title, content, excerpt, category, tags, slug, status, featured_image } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'title and content are required.' });
        }
        const data = await blogModel.createBlog({
            title, content, excerpt: excerpt || null, category: category || null,
            tags: tags || [], slug: slug || null, status: status || 'draft',
            featured_image: featured_image || null, author_id: req.user.id
        });
        res.status(201).json(data);
    } catch (error) {
        console.error('createBlog error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create blog' });
    }
};

export const updateBlog = async (req, res) => {
    try {
        const data = await blogModel.updateBlog(req.params.id, req.body);
        res.status(200).json(data);
    } catch (error) {
        console.error('updateBlog error:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update blog' });
    }
};
