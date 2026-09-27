const express = require('express');
const cors = require('cors');
const path = require('path');
const hostingConfig = require('./config/hosting');
const securityConfig = require('./config/security');
const securityHeaders = require('./middleware/securityHeaders');
const healthRoutes = require('./routes/health.routes');
const companyRoutes = require('./routes/company.routes');
const authRoutes = require('./routes/auth.routes');
const jobRoleRoutes = require('./routes/job-role.routes');
const salaryRoutes = require('./routes/salary.routes');
const verificationRoutes = require('./routes/verification.routes');
const reviewRoutes = require('./routes/review.routes');
const interviewRoutes = require('./routes/interview.routes');
const reportRoutes = require('./routes/report.routes');
const adminRoutes = require('./routes/admin.routes');
const browseRoutes = require('./routes/browse.routes');
const jobRoutes = require('./routes/job.routes');
const meRoutes = require('./routes/me.routes');
const representativeRoutes = require('./routes/representative.routes');
const publicRoutes = require('./routes/public.routes');
const aiRoutes = require('./routes/ai.routes');
const siteController = require('./controllers/site.controller');
const authenticate = require('./middleware/authenticate');
const requireAdmin = require('./middleware/requireAdmin');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { sendSuccess } = require('./utils/apiResponse');

const app = express();
const frontendDirectory = path.resolve(__dirname, '..', 'frontend');

if (hostingConfig.isRenderEnvironment()) {
  app.set('trust proxy', 1);
}

// Saple never advertises its server software.
app.disable('x-powered-by');

// Headers first, so they apply to static files, API answers and errors alike.
app.use(securityHeaders);
app.use(cors(hostingConfig.createCorsOptionsDelegate()));
app.use(express.json({ limit: securityConfig.MAX_JSON_BODY_BYTES }));
app.use(express.urlencoded({ extended: true, limit: securityConfig.MAX_JSON_BODY_BYTES }));

// Crawler and security-contact files are generated from the requesting origin,
// so they stay correct on localhost and on any future domain.
app.get('/robots.txt', siteController.getRobots);
app.get('/sitemap.xml', siteController.getSitemap);
app.get('/.well-known/security.txt', siteController.getSecurityTxt);
app.get('/security.txt', siteController.getSecurityTxt);

app.get('/api', (request, response) => {
  return sendSuccess(response, 200, 'Welcome to the Saple API');
});

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/job-roles', jobRoleRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/me', meRoutes);
app.use('/api/representative', representativeRoutes);
app.use('/api/assistant', aiRoutes);
app.use('/api', publicRoutes);
app.use('/api', browseRoutes);
app.use('/api/admin', authenticate, requireAdmin, adminRoutes);
app.use('/api/companies', verificationRoutes);
app.use('/api/companies', reviewRoutes);
app.use('/api/companies', interviewRoutes);
app.use('/api/companies', salaryRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/submissions', reportRoutes);

app.use(express.static(frontendDirectory, {
  // Directory listing is off by default; being explicit keeps it that way,
  // and dotfiles such as .env can never be served even if one appears here.
  dotfiles: 'ignore',
  index: 'index.html',
  redirect: false
}));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
