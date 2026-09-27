const express = require('express');
const cors = require('cors');
const path = require('path');
const hostingConfig = require('./config/hosting');
const securityConfig = require('./config/security');
const securityHeaders = require('./middleware/securityHeaders');
const { isPrivatePath } = require('./config/pages');
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

// Emergency hosted review mode for the public Render deployment.
//
// Google Safe Browsing flagged the hosted site for deceptive/phishing behavior.
// While that review is unresolved, the public Render build is intentionally
// browse-only: no hosted page collects credentials or other account data, and
// no state-changing API accepts submissions. Local development is unaffected.
//
// After Google clears the deployment, the owner can explicitly re-enable the
// interactive hosted demo by setting PUBLIC_INTERACTIVE_FEATURES=true in the
// Render environment and redeploying. Keeping the opt-in explicit prevents a
// future redeploy from accidentally restoring credential forms during review.
const hostedReviewMode = hostingConfig.isRenderEnvironment()
  && process.env.PUBLIC_INTERACTIVE_FEATURES !== 'true';

function sendHostedReviewModePage(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return response.status(200).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <meta name="description" content="Saple hosted demo account features are temporarily unavailable during a security review.">
  <title>Hosted demo review mode | Saple</title>
  <link rel="stylesheet" href="/css/common.css">
</head>
<body>
  <header class="site-header">
    <nav class="navbar container" aria-label="Main navigation">
      <a class="brand" href="/" aria-label="Saple home"><span class="brand-mark" aria-hidden="true">S</span><span>Saple</span></a>
    </nav>
  </header>
  <main class="container" id="main-content">
    <section class="card" style="max-width:760px;margin:4rem auto;padding:2rem">
      <p class="eyebrow">Hosted demo review mode</p>
      <h1>Account and contribution features are temporarily unavailable.</h1>
      <p>This public deployment is currently browse-only while its security listing is being reviewed. This page does not ask for passwords, login credentials, payment details, or company account credentials.</p>
      <p>You can still browse Saple's public company, salary, review, interview, and job information.</p>
      <p><a class="button button-primary" href="/">Return to Saple</a> <a class="button button-secondary" href="/security.html">Security information</a></p>
    </section>
  </main>
  <footer class="site-footer"><p class="footer-fallback container">&copy; 2026 Saple. Independent BUET CSE academic project.</p></footer>
</body>
</html>`);
}

if (hostedReviewMode) {
  app.use((request, response, next) => {
    const isApiPath = request.path === '/api' || request.path.startsWith('/api/');

    // Replace every hosted account/workspace/contribution page with a neutral,
    // non-interactive explanation. The original pages remain available locally
    // for the course demo and automated tests.
    if (!isApiPath && isPrivatePath(request.path)) {
      return sendHostedReviewModePage(response);
    }

    // Make the public hosted deployment read-only during review. GET/HEAD and
    // CORS preflight remain available, but credential, account, application,
    // moderation and contribution writes cannot be submitted remotely.
    if (isApiPath && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return response.status(503).json({
        success: false,
        message: 'Interactive account and contribution features are temporarily disabled on the hosted demo during a security review.'
      });
    }

    return next();
  });
}

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
