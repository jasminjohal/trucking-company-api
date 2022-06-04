const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();
const request = require("request");
require("dotenv").config();

router.use(bodyParser.json());

router.post("/", function (req, res) {
  const username = req.body.username;
  const password = req.body.password;
  const options = {
    method: "POST",
    url: `https://${process.env.DOMAIN}/oauth/token`,
    headers: { "content-type": "application/json" },
    body: {
      grant_type: "password",
      username: username,
      password: password,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
    },
    json: true,
  };
  request(options, (error, response, body) => {
    if (error) {
      res.status(500).send(error);
    } else {
      res.send(body);
    }
  });
});

module.exports = router;
