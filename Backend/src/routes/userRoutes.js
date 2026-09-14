const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { 
  getProfile, 
  updateProfile, 
  deleteAccount, 
  initiatePasswordChange, 
  confirmPasswordChange,
  searchUsers,
  setPublicKey,
  getPublicKey,
  setKeyBackup,
  getKeyBackup
} = require('../controllers/userController');

router.use(authMiddleware);

router.get('/search', searchUsers);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.delete('/profile', deleteAccount);

// End-to-end encryption key exchange for messaging.
router.put('/public-key', setPublicKey);
router.get('/:userId/public-key', getPublicKey);

// Password-wrapped E2EE private key backup - self only (no :userId param),
// so no one can fetch another user's encrypted key material.
router.put('/key-backup', setKeyBackup);
router.get('/key-backup', getKeyBackup);

router.post('/change-password-init', initiatePasswordChange);
router.post('/change-password-confirm', confirmPasswordChange);

module.exports = router;