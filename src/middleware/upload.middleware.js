import multer from 'multer';
import { supabase } from '../config/supabase.js';
import path from 'path';

// Store file in memory buffer, then upload to Supabase Storage
const storage = multer.memoryStorage();

export const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        if (ext && mime) return cb(null, true);
        cb(new Error('Only JPEG, JPG, PNG, and WEBP images are allowed.'));
    },
});

/**
 * Uploads a file buffer to Supabase Storage and returns the public URL.
 * @param {Buffer} buffer - File buffer from multer memoryStorage
 * @param {string} originalname - Original filename for extension detection
 * @param {string} folder - Folder inside the bucket (e.g. 'services', 'practitioners')
 * @returns {string} Public URL of the uploaded file
 */
export const uploadToSupabase = async (buffer, originalname, folder = 'uploads') => {
    const ext = path.extname(originalname).toLowerCase();
    const filename = `${folder}/${Date.now()}${ext}`;

    const { error } = await supabase.storage
        .from('images')
        .upload(filename, buffer, {
            contentType: `image/${ext.replace('.', '')}`,
            upsert: false,
        });

    if (error) throw new Error(`Image upload failed: ${error.message}`);

    const { data } = supabase.storage
        .from('images')
        .getPublicUrl(filename);

    return data.publicUrl;
};
