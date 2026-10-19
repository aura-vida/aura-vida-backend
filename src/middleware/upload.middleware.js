import multer from 'multer';
import { supabase } from '../config/supabase.js';
import path from 'path';

// Store file in memory buffer, then upload to Supabase Storage
const storage = multer.memoryStorage();

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const IMAGE_TOO_LARGE_MESSAGE = 'Image must be smaller than 5MB.';

export const upload = multer({
    storage,
    // Reject files that are 5MB or larger; multer's limit check is exclusive
    // (rejects only when size exceeds it), so subtract 1 byte to make 5MB itself fail too.
    limits: { fileSize: MAX_IMAGE_SIZE_BYTES - 1 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        if (ext && mime) return cb(null, true);
        cb(new Error('Only JPEG, JPG, PNG, and WEBP images are allowed.'));
    },
});

const uploadFile = async (buffer, originalname, folder) => {
    const ext = path.extname(originalname).toLowerCase();
    // A random suffix (not just Date.now()) avoids collisions when several
    // files from the same request upload concurrently and land in the same
    // millisecond.
    const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

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

    return { url: data.publicUrl, path: filename };
};

/**
 * Uploads a file buffer to Supabase Storage and returns the public URL.
 * @param {Buffer} buffer - File buffer from multer memoryStorage
 * @param {string} originalname - Original filename for extension detection
 * @param {string} folder - Folder inside the bucket (e.g. 'services', 'practitioners')
 * @returns {string} Public URL of the uploaded file
 */
export const uploadToSupabase = async (buffer, originalname, folder = 'uploads') => {
    const { url } = await uploadFile(buffer, originalname, folder);
    return url;
};

/**
 * Same as uploadToSupabase, but also returns the storage path so the caller
 * can delete the object later (e.g. a gallery image being removed).
 * @returns {{ url: string, path: string }}
 */
export const uploadImageWithPath = async (buffer, originalname, folder = 'uploads') => {
    return uploadFile(buffer, originalname, folder);
};
