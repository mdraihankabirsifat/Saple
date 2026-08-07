const express = require('express');
const browseController = require('../controllers/browse.controller');

const router = express.Router();
router.get('/salaries', browseController.getSalaries);
router.get('/reviews', browseController.getReviews);
router.get('/interviews', browseController.getInterviews);

module.exports = router;
