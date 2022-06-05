const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();
const { auth, requiresAuth } = require("express-openid-connect");
const ds = require("./datastore");
require("dotenv").config();

const datastore = ds.datastore;
const USER = "User";

router.use(bodyParser.json());
const config = {
  authRequired: false,
  auth0Logout: true,
  issuerBaseURL: `https://${process.env.DOMAIN}`,
  baseURL: process.env.BASE_URL,
  clientID: process.env.CLIENT_ID,
  secret: process.env.CLIENT_SECRET,
};

router.use(auth(config));

/* ------------- Begin Lodging Model Functions ------------- */

function post_user(name, sub) {
  var key = datastore.key(USER);
  const new_user = { name: name, sub: sub };
  return datastore.save({ key: key, data: new_user }).then(() => {
    return key;
  });
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get("/", (req, res) => {
  res.send(req.oidc.isAuthenticated() ? "Logged in" : "Logged out");
});

// The /profile route will show the user profile as JSON
router.get("/profile", requiresAuth(), (req, res) => {
  const idToken = req.oidc.idToken;
  const userName = req.oidc.user.name;
  const userSub = req.oidc.user.sub;

  ds.getEntitiesInKind(USER)
    .then((users) => {
      let userExists = false;
      for (let i = 0; i < users.length; i++) {
        if (users[i].sub === userSub) {
          userExists = true;
        }
      }

      if (!userExists) {
        console.log("added new user to db");
        post_user(userName, userSub);
      }
    })
    // display user's information
    .finally(() => {
      res.send({ id_token: idToken, user_id: userSub });
    });
});

router.get("/users", (req, res) => {
  const accepts = req.accepts(["application/json"]);
  if (!accepts) {
    return res.status(406).json({
      Error: "This application only supports JSON responses",
    });
  }

  ds.getEntitiesInKind(USER).then((users) => {
    res.status(200).json({ data: users });
  });
});

/* ------------- End Controller Functions ------------- */

module.exports = router;
