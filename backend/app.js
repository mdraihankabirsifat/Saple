const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/health.routes');
const companyRoutes = require('./routes/company.routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { sendSuccess } = require('./utils/apiResponse');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (request, response) => {
  return sendSuccess(response, 200, 'Welcome to the Saple API');
});

app.use('/api/health', healthRoutes);
app.use('/api/companies', companyRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
