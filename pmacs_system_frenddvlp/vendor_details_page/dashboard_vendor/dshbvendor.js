const express = require('express');
const app = express();
const port = 5500;

// Respond to GET request on the root route
app.get('/', (req, res) => {
  res.send('GET request to the homepage');
});

// Respond to POST request on the root route
app.post('/', (req, res) => {
  res.send('POST request to the homepage');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
