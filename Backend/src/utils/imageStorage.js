const cloudinary = require('../config/cloudinary');
const ApiError = require('./ApiError');
const logger = require('../config/logger');
const {
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_MB,
  ALLOWED_IMAGE_MIME_TO_EXT
} = require('../constants/upload');

const DATA_URL_REGEX = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/;

/**
 * Validates and uploads a base64 data-url image to Cloudinary.
 * @param {string} dataUrl - e.g. "data:image/png;base64,AAAA..."
 * @param {string} folder - Cloudinary folder to store the asset in (e.g. "opportunities")
 * @returns {Promise<{ url: string, publicId: string }>}
 */
const saveBase64Image = async (dataUrl, folder) => {
  const match = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_REGEX) : null;

  if (!match) {
    throw ApiError.badRequest('Image must be a valid base64-encoded image data URL');
  }

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];

  if (!ALLOWED_IMAGE_MIME_TO_EXT[mimeType]) {
    throw ApiError.badRequest('Unsupported image type. Allowed types: PNG, JPEG, WEBP, GIF');
  }

  // Rough size check before sending anything over the wire to Cloudinary.
  const approxBytes = Math.floor((base64Data.length * 3) / 4);
  if (approxBytes === 0) {
    throw ApiError.badRequest('Image data is empty or invalid');
  }
  if (approxBytes > MAX_IMAGE_SIZE_BYTES) {
    throw ApiError.badRequest(`Image must not exceed ${MAX_IMAGE_SIZE_MB}MB`);
  }

  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: `wastezero/${folder}`,
      resource_type: 'image'
    });

    return { url: result.secure_url, publicId: result.public_id };
  } catch (err) {
    logger.error(`Cloudinary upload failed: ${err.message}`);
    throw ApiError.badRequest('Failed to upload image. Please try again.');
  }
};

/**
 * Deletes a previously uploaded Cloudinary image given its public ID.
 * Safe to call with null/undefined - it will just no-op.
 * @param {string} publicId
 */
const deleteImageFile = async (publicId) => {
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    // Non-fatal: the DB update should not fail because a stale Cloudinary asset couldn't be removed.
    logger.error(`Failed to delete Cloudinary asset ${publicId}: ${err.message}`);
  }
};

module.exports = {
  saveBase64Image,
  deleteImageFile
};
