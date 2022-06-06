const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();

const errors = require("./errors");

const ds = require("./datastore");
const datastore = ds.datastore;

const LOAD = "Load";

router.use(bodyParser.json());

/* ------------- Begin load Model Functions ------------- */

function postLoad(vendor, item, quantity, weight) {
  var key = datastore.key(LOAD);
  const load = {
    vendor,
    item,
    quantity,
    weight,
    carrier: null,
  };
  return datastore.save({ key: key, data: load }).then(() => {
    return key;
  });
}

function putLoad(id, vendor, item, quantity, weight) {
  const key = datastore.key([LOAD, parseInt(id, 10)]);
  const load = {
    vendor,
    item,
    quantity,
    weight,
    carrier: null,
  };
  return datastore.save({ key: key, data: load });
}

function patchLoad(
  id,
  vendor = null,
  item = null,
  quantity = null,
  weight = null
) {
  const l_key = datastore.key([LOAD, parseInt(id, 10)]);

  return datastore.get(l_key).then((load) => {
    load[0].vendor = vendor ?? load[0].vendor;
    load[0].item = item ?? load[0].item;
    load[0].quantity = quantity ?? load[0].quantity;
    load[0].weight = weight ?? load[0].weight;
    return datastore.save({ key: l_key, data: load[0] });
  });
}

function deleteLoad(id) {
  const key = datastore.key([LOAD, parseInt(id, 10)]);
  return datastore.delete(key);
}

// ignore any extraneous attributes by only extracting relevant values from request
function getLoadPropertiesFromRequest(req) {
  return [req.body.vendor, req.body.item, req.body.quantity, req.body.weight];
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get("/", function (req, res) {
  if (!ds.hasJsonInAcceptHeader(req)) {
    return errors.displayErrorMessage(res, 406);
  }

  ds.getEntitiesInKind(LOAD).then((loads) => {
    const numLoads = loads.length;
    ds.getFiveEntities(LOAD, req, numLoads, "loads").then((loads) => {
      res.status(200).json(loads);
    });
  });
});

router.get("/:id", function (req, res) {
  if (!ds.hasJsonInAcceptHeader(req)) {
    return errors.displayErrorMessage(res, 406);
  }

  ds.getEntityByID(LOAD, req.params.id).then((load) => {
    if (!load[0]) {
      return errors.displayErrorMessage(res, 404, "load");
    }

    res.status(200).json(ds.addSelfLinksToLoad(load[0], req));
  });
});

router.post("/", function (req, res) {
  if (!ds.hasValidContentType(req)) {
    return errors.displayErrorMessage(res, 415);
  }

  if (!ds.hasJsonInAcceptHeader(req)) {
    return errors.displayErrorMessage(res, 406);
  }

  // ensure all required attributes are included in the request
  const loadValues = getLoadPropertiesFromRequest(req);
  if (ds.hasFalsyValue(loadValues)) {
    return errors.displayErrorMessage(res, 400);
  }

  postLoad(...loadValues).then((key) => {
    const loadID = key.id;
    ds.getEntityByID(LOAD, loadID).then((load) => {
      res.status(201).send(ds.addSelfLinksToLoad(load[0], req));
    });
  });
});

router.put("/:id", function (req, res) {
  if (!ds.hasValidContentType(req)) {
    return errors.displayErrorMessage(res, 415);
  }

  if (!ds.hasJsonInAcceptHeader(req)) {
    return errors.displayErrorMessage(res, 406);
  }

  const loadID = req.params.id;
  ds.getEntityByID(LOAD, loadID).then((load) => {
    if (!load[0]) {
      return errors.displayErrorMessage(res, 404, "load");
    }

    // ensure all required attributes are included in the request
    const loadValues = getLoadPropertiesFromRequest(req);
    if (ds.hasFalsyValue(loadValues)) {
      return errors.displayErrorMessage(res, 400);
    }

    // remove load from truck list of loads if applicable
    const truckID = load[0].carrier;
    if (truckID) {
      ds.removeLoadFromTruck(truckID, loadID);
    }

    putLoad(loadID, ...loadValues).then(() => {
      ds.getEntityByID(LOAD, loadID).then((load) => {
        res.status(200).send(ds.addSelfLinksToLoad(load[0], req));
      });
    });
  });
});

router.patch("/:id", function (req, res) {
  if (!ds.hasValidContentType(req)) {
    return errors.displayErrorMessage(res, 415);
  }

  if (!ds.hasJsonInAcceptHeader(req)) {
    return errors.displayErrorMessage(res, 406);
  }

  const loadID = req.params.id;
  ds.getEntityByID(LOAD, loadID).then((load) => {
    if (!load[0]) {
      return errors.displayErrorMessage(res, 404, "load");
    }

    // ensure the request has at least one required attribute
    const loadValues = getLoadPropertiesFromRequest(req);
    if (!ds.hasTruthyValue(loadValues)) {
      return errors.displayErrorMessage(res, 400);
    }

    patchLoad(loadID, ...loadValues).then(() => {
      ds.getEntityByID(LOAD, loadID).then((load) => {
        res.status(200).send(ds.addSelfLinksToLoad(load[0], req));
      });
    });
  });
});

router.delete("/:id", function (req, res) {
  const loadID = req.params.id;

  // check if load id exists in database
  ds.getEntityByID(LOAD, loadID).then((load) => {
    if (!load[0]) {
      return errors.displayErrorMessage(res, 404, "load");
    }

    deleteLoad(loadID)
      .then(() => {
        // remove load from truck's list of loads if applicable
        const truckID = load[0].carrier;
        if (truckID) {
          ds.removeLoadFromTruck(truckID, id);
        }
      })
      .finally(res.status(204).end());
  });
});

router.delete("/", function (req, res) {
  return errors.displayErrorMessage(res, 405);
});

/* ------------- End Controller Functions ------------- */

module.exports = router;
