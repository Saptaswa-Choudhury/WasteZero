// Configuration for opportunity image uploads.
// Images are sent from the client as base64 data URLs (e.g. "data:image/png;base64,....")
// so no extra multipart-parsing dependency is required.

const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

// Base64 inflates payload size by ~4/3, so cap the raw string length accordingly
// with a little headroom for the data-url prefix.
const MAX_BASE64_STRING_LENGTH = Math.ceil((MAX_IMAGE_SIZE_BYTES * 4) / 3) + 100;

const ALLOWED_IMAGE_MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const ALLOWED_IMAGE_MIME_TYPES = Object.keys(ALLOWED_IMAGE_MIME_TO_EXT);

// Matches: data:image/png;base64,iVBORw0KGgoAAAANS...
const BASE64_IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

const OPPORTUNITY_IMAGE_SUBDIR = 'opportunities';

module.exports = {
  MAX_IMAGE_SIZE_MB,
  MAX_IMAGE_SIZE_BYTES,
  MAX_BASE64_STRING_LENGTH,
  ALLOWED_IMAGE_MIME_TO_EXT,
  ALLOWED_IMAGE_MIME_TYPES,
  BASE64_IMAGE_PATTERN,
  OPPORTUNITY_IMAGE_SUBDIR
};
