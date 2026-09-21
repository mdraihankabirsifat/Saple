const express = require('express');
const jobController = require('../controllers/job.controller');
const applicationController = require('../controllers/application.controller');
const verificationController = require('../controllers/verification.controller');
const representativeController = require('../controllers/representative.controller');
const authenticate = require('../middleware/authenticate');
const requireCompanyRepresentative = require('../middleware/requireCompanyRepresentative');

const router = express.Router();

// Every route below is company-scoped. authenticate() reloads the active
// assignments from PostgreSQL on each request, and requireCompanyRepresentative
// rejects an account whose last scope has been revoked, even if its JWT is
// still inside its lifetime.
router.use(authenticate, requireCompanyRepresentative);

router.get('/workspace', representativeController.getWorkspace);

router.get('/verifications', verificationController.listScoped);
router.get('/verifications/:verificationId', verificationController.getScoped);
router.patch('/verifications/:verificationId/status', verificationController.decideScoped);

router.get('/jobs', jobController.listManaged);
router.post('/companies/:companyId/jobs', jobController.create);
router.get('/jobs/:jobId', jobController.getManaged);
router.put('/jobs/:jobId', jobController.update);
router.patch('/jobs/:jobId/status', jobController.updateStatus);

router.get('/applications', applicationController.listScoped);
router.get('/applications/:applicationId', applicationController.getScoped);
router.patch('/applications/:applicationId/status', applicationController.decide);

module.exports = router;
