const express = require('express');
const authenticate = require('../middleware/authenticate');
const { optionalAuthenticate } = require('../middleware/authenticate');
const controller = require('../controllers/message.controller');
const searchController = require('../controllers/search.controller');
const { limit: searchLimit } = require('./search.routes');
const router = express.Router();
// A member profile is readable by anyone, and carries only public fields.
router.get('/:userId/profile', optionalAuthenticate, searchLimit, controller.profile);
// Finding people to message stays signed-in only.
router.use(authenticate);
router.get('/search', searchLimit, searchController.people);
module.exports = router;
