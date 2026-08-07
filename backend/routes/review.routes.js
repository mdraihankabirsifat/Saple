const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireVerifiedEmployee = require('../middleware/requireVerifiedEmployee');
const reviewController = require('../controllers/review.controller');
const router = express.Router();
router.get('/:companyId/reviews', reviewController.list);
router.post('/:companyId/reviews', authenticate, requireVerifiedEmployee, reviewController.submit);
module.exports = router;
