const express = require('express');
const cors = require('cors');
const path = require('path');
const hostingConfig = require('./config/hosting');
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

app.use(cors(hostingConfig.createCorsOptionsDelegate()));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api', (request, response) => {
  return sendSuccess(response, 200, 'Welcome to the Saple API');
});

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/job-roles', jobRoleRoutes);
app.use('/api', browseRoutes);
app.use('/api/admin', authenticate, requireAdmin, adminRoutes);
app.use('/api/companies', verificationRoutes);
app.use('/api/companies', reviewRoutes);
app.use('/api/companies', interviewRoutes);
app.use('/api/companies', salaryRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/submissions', reportRoutes);

app.use(express.static(frontendDirectory));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
