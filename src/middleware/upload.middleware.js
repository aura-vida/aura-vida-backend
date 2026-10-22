import multer from 'multer';
import path from 'path';
import { uploadBuffer } from '../services/s3.service.js';

// Store file in memory buffer, then upload to S3
const storage = multer.memoryStorage();

export const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const IMAGE_TOO_LARGE_MESSAGE = 'Image must be smaller than 50MB.';

export const upload = multer({
    storage,
    // Reject files that are 50MB or larger; multer's limit check is exclusive
    // (rejects only when size exceeds it), so subtract 1 byte to make 50MB itself fail too.
    limits: { fileSize: MAX_IMAGE_SIZE_BYTES - 1 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        if (ext && mime) return cb(null, true);
        cb(new Error('Only JPEG, JPG, PNG, and WEBP images are allowed.'));
    },
});

/**
 * Uploads a file buffer to S3 and returns its public URL.
 * @param {Buffer} buffer - File buffer from multer memoryStorage
 * @param {string} originalname - Original filename for extension detection
 * @param {string} folder - Folder (S3 key prefix) e.g. 'services', 'practitioner-photos'
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export const uploadImage = async (buffer, originalname, folder = 'uploads') => {
    const { url } = await uploadBuffer(buffer, originalname, folder);
    return url;
};

/**
 * Same as uploadImage, but also returns the S3 key (as `path`, matching the
 * `storage_path` column callers persist it to) so the object can be deleted
 * later (e.g. a gallery image being removed).
 * @returns {Promise<{ url: string, path: string }>}
 */
export const uploadImageWithPath = async (buffer, originalname, folder = 'uploads') => {
    const { url, key } = await uploadBuffer(buffer, originalname, folder);
    return { url, path: key };
};
