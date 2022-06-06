const errors = {
  400: "The request object is missing at least one of the required attributes",
  401: "Invalid token.",
  403: {
    unauthorized: "You do not have access to this truck",
    loadAlreadyAssigned: "The load is already loaded on another truck",
  },
  404: {
    truck: "No truck with this truck_id exists",
    load: "No load with this load_id exists",
    either:
      "No truck with this truck_id is loaded with the load with this load_id",
  },
  405: "This endpoint is not supported",
  406: "This application only supports JSON responses",
  415: "Server only accepts application/json data.",
};

function displayErrorMessage(res, statusCode, subcategory = null) {
  let errorMsg = errors[statusCode];

  if (subcategory) {
    errorMsg = errorMsg[subcategory];
  }

  return res.status(statusCode).json({ Error: errorMsg });
}

module.exports.displayErrorMessage = displayErrorMessage;

// if (!ds.hasValidContentType(req)) {
//   return errors.displayErrorMessage(res, 415);
// }

// if (!ds.hasJsonInAcceptHeader(req)) {
//   return errors.displayErrorMessage(res, 406);
// }

// if (!truck[0]) {
//   return errors.displayErrorMessage(res, 404, "truck");
// }

// if (!ds.ownerIsValid(req, truck[0])) {
//   return errors.displayErrorMessage(res, 403, "unauthorized");
// }

// return errors.displayErrorMessage(res, 400);
// return errors.displayErrorMessage(res, 405);
