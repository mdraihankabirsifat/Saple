const express = require('express');
const browseController = require('../controllers/browse.controller');
const { optionalAuthenticate } = require('../middleware/authenticate');

const router = express.Router();
router.get('/salaries', browseController.getSalaries);
router.get('/reviews', browseController.getReviews);
router.get('/interviews', optionalAuthenticate, browseController.getInterviews);

module.exports = router;
