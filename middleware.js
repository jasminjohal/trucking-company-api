const { expressjwt: jwt } = require("express-jwt");
const jwksRsa = require("jwks-rsa");
const errors = require("./errors");

const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${process.env.DOMAIN}/.well-known/jwks.json`,
  }),

  // Validate the audience and the issuer.
  issuer: `https://${process.env.DOMAIN}/`,
  algorithms: ["RS256"],
});

// error handler to catch missing or invalid JWT
function checkJwtError(err, req, res, next) {
  if (err.name === "UnauthorizedError") {
    return errors.displayErrorMessage(res, 401);
  } else {
    next(err);
  }
}

module.exports.checkJwt = checkJwt;
module.exports.checkJwtError = checkJwtError;
