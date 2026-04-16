const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const apiRoutes = require('./api');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Mount API routes
app.use('/api', apiRoutes);

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
