const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();

const ds = require("./datastore");
const mw = require("./middleware");
const errors = require("./errors");

const datastore = ds.datastore;

const TRUCK = "Truck";
const LOAD = "Load";

router.use(bodyParser.json());
router.use(mw.checkJwt);
router.use(mw.checkJwtError);

/* ------------- Begin Truck Model Functions ------------- */

// add a new truck entity
function postTruck(
  owner,
  truck_vin,
  trailer_vin,
  truck_model,
  trailer_type,
  trailer_capacity
) {
  var key = datastore.key(TRUCK);
  const new_truck = {
    owner,
    truck_vin,
    trailer_vin,
    truck_model,
    trailer_type,
    trailer_capacity,
    loads: [],
  };
  return datastore.save({ key: key, data: new_truck }).then(() => {
    return key;
  });
}

function putTruck(
  id,
  owner,
  truck_vin,
  trailer_vin,
  truck_model,
  trailer_type,
  trailer_capacity
) {
  const key = datastore.key([TRUCK, parseInt(id, 10)]);
  const truck = {
    owner,
    truck_vin,
    trailer_vin,
    truck_model,
    trailer_type,
    trailer_capacity,
    loads: [],
  };
  return datastore.save({ key: key, data: truck });
}

function patchTruck(
  id,
  owner = null,
  truck_vin = null,
  trailer_vin = null,
  truck_model = null,
  trailer_type = null,
  trailer_capacity = null
) {
  const l_key = datastore.key([TRUCK, parseInt(id, 10)]);

  return datastore.get(l_key).then((truck) => {
    truck[0].owner = owner ?? truck[0].owner;
    truck[0].truck_vin = truck_vin ?? truck[0].truck_vin;
    truck[0].trailer_vin = trailer_vin ?? truck[0].trailer_vin;
    truck[0].truck_model = truck_model ?? truck[0].truck_model;
    truck[0].trailer_type = trailer_type ?? truck[0].trailer_type;
    truck[0].trailer_capacity = trailer_capacity ?? truck[0].trailer_capacity;
    return datastore.save({ key: l_key, data: truck[0] });
  });
}

function deleteTruck(id) {
  const key = datastore.key([TRUCK, parseInt(id, 10)]);
  return datastore.delete(key);
}

function addLoadToTruck(truckID, loadID) {
  const l_key = datastore.key([TRUCK, parseInt(truckID, 10)]);
  return datastore.get(l_key).then((truck) => {
    if (typeof truck[0].loads === "undefined") {
      truck[0].loads = [];
    }
    truck[0].loads.push(loadID);
    return datastore.save({ key: l_key, data: truck[0] });
  });
}

// update 'carrier' property of a load entity
// set 'carrier' to either null or truckID depending on value of truckID
function modifyLoadCarrier(loadID, truckID) {
  const key = datastore.key([LOAD, parseInt(loadID, 10)]);
  return ds.getEntityByID(LOAD, loadID).then((load) => {
    const patched_load = {
      vendor: load[0].vendor,
      item: load[0].item,
      quantity: load[0].quantity,
      weight: load[0].weight,
      carrier: truckID,
    };

    return datastore.save({ key: key, data: patched_load });
  });
}

// nullify 'carrier' property for any load on a truck
function removeCarrierForMultipleLoads(truck) {
  let promises = [];
  for (let i = 0; i < truck.loads.length; i++) {
    let load = truck.loads[i];
    promises.push(modifyLoadCarrier(load, null));
  }

  Promise.all(promises);
}

// ignore any extraneous attributes by only extracting relevant values from request
function getTruckPropertiesFromRequest(req) {
  return [
    req.auth.sub,
    req.body.truck_vin,
    req.body.trailer_vin,
    req.body.truck_model,
    req.body.trailer_type,
    req.body.trailer_capacity,
  ];
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get("/", function (req, res) {
  if (!ds.hasJsonInAcceptHeader(req)) {
    return errors.displayErrorMessage(res, 406);
  }

  const owner = req.auth.sub;
  ds.getProtectedEntitiesInKind(TRUCK, owner).then((trucks) => {
    const results = {};
    results.data = trucks.map((trucks) => {
      return ds.addSelfLinksToTruck(trucks, req);
    });
    res.status(200).json(results);
  });
});

router.get("/:id", function (req, res) {
  if (!ds.hasJsonInAcceptHeader(req)) {
    return errors.displayErrorMessage(res, 406);
  }

  const truckID = req.params.id;
  ds.getEntityByID(TRUCK, truckID).then((truck) => {
    if (!truck[0]) {
      return errors.displayErrorMessage(res, 404, "truck");
    }

    if (!ds.ownerIsValid(req, truck[0])) {
      return errors.displayErrorMessage(res, 403, "unauthorized");
    }

    // modify output so that it includes self link for truck and self links for all of its loads
    res.status(200).json(ds.addSelfLinksToTruck(truck[0], req));
  });
});

router.post("/", function (req, res) {
  if (!ds.hasValidContentType(req)) {
    return errors.displayErrorMessage(res, 415);
  }

  // ensure all required attributes are included in the request
  const truckValues = getTruckPropertiesFromRequest(req);
  if (ds.hasFalsyValue(truckValues)) {
    return errors.displayErrorMessage(res, 400);
  }

  postTruck(...truckValues).then((key) => {
    // get the truck that was just created
    const truckID = key.id;
    ds.getEntityByID(TRUCK, truckID).then((truck) => {
      res.status(201).send(ds.addSelfLinksToTruck(truck[0], req));
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

  const truckID = req.params.id;
  ds.getEntityByID(TRUCK, truckID).then((truck) => {
    if (!truck[0]) {
      return errors.displayErrorMessage(res, 404, "truck");
    }

    if (!ds.ownerIsValid(req, truck[0])) {
      return errors.displayErrorMessage(res, 403, "unauthorized");
    }

    // ensure all required attributes are included in the request
    const truckValues = getTruckPropertiesFromRequest(req);
    if (ds.hasFalsyValue(truckValues)) {
      return errors.displayErrorMessage(res, 400);
    }

    removeCarrierForMultipleLoads(truck[0]);
    putTruck(truckID, ...truckValues).then(() => {
      // get the truck that was just modified
      ds.getEntityByID(TRUCK, truckID).then((truck) => {
        res.status(200).send(ds.addSelfLinksToTruck(truck[0], req));
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

  const truckID = req.params.id;
  ds.getEntityByID(TRUCK, truckID).then((truck) => {
    if (!truck[0]) {
      return errors.displayErrorMessage(res, 404, "truck");
    }

    if (!ds.ownerIsValid(req, truck[0])) {
      return errors.displayErrorMessage(res, 403, "unauthorized");
    }

    // ensure at least one attribute is included in the request
    const truckValues = getTruckPropertiesFromRequest(req);
    // ignore first value since it's the JWT sub
    if (!ds.hasTruthyValue(truckValues.slice(1))) {
      return errors.displayErrorMessage(res, 400);
    }

    patchTruck(truckID, ...truckValues).then(() => {
      // get the truck that was just modified
      ds.getEntityByID(TRUCK, truckID).then((truck) => {
        res.status(200).send(ds.addSelfLinksToTruck(truck[0], req));
      });
    });
  });
});

router.put("/:truckID/loads/:loadID", function (req, res) {
  const truckID = req.params.truckID;
  const loadID = req.params.loadID;

  ds.getEntityByID(TRUCK, truckID).then((truck) => {
    if (!truck[0]) {
      return errors.displayErrorMessage(res, 404, "truck");
    }

    if (!ds.ownerIsValid(req, truck[0])) {
      return errors.displayErrorMessage(res, 403, "unauthorized");
    }

    ds.getEntityByID(LOAD, loadID).then((load) => {
      if (!load[0]) {
        return errors.displayErrorMessage(res, 404, "load");
      }

      // check if load hasn't already been assigned to a truck
      if (truck[0].loads.includes(loadID) || load[0].carrier !== null) {
        return errors.displayErrorMessage(res, 403, "loadAlreadyAssigned");
      }

      // update truck's list of loads to include this load
      addLoadToTruck(truckID, loadID).then(() => {
        // update load's 'carrier' property to this truck
        modifyLoadCarrier(loadID, truckID).then(res.status(204).end());
      });
    });
  });
});

router.delete("/:truckID/loads/:loadID", function (req, res) {
  const truckID = req.params.truckID;
  const loadID = req.params.loadID;

  ds.getEntityByID(TRUCK, truckID).then((truck) => {
    if (!truck[0]) {
      return errors.displayErrorMessage(res, 404, "truck");
    }

    if (!ds.ownerIsValid(req, truck[0])) {
      return errors.displayErrorMessage(res, 403, "unauthorized");
    }

    ds.getEntityByID(LOAD, loadID).then((load) => {
      if (!load[0]) {
        return errors.displayErrorMessage(res, 404, "load");
      }

      // check if load is actually on truck
      if (!truck[0].loads.includes(loadID) || load[0].carrier !== truckID) {
        return errors.displayErrorMessage(res, 404, "either");
      }

      // remove load from truck's 'loads' property
      ds.removeLoadFromTruck(truckID, loadID).then(
        // nullify this load's 'carrier' property
        modifyLoadCarrier(loadID, null).then(res.status(204).end())
      );
    });
  });
});

router.delete("/:id", function (req, res) {
  const truckID = req.params.id;

  ds.getEntityByID(TRUCK, truckID).then((truck) => {
    if (!truck[0]) {
      return errors.displayErrorMessage(res, 404, "truck");
    }

    if (!ds.ownerIsValid(req, truck[0])) {
      return errors.displayErrorMessage(res, 403, "unauthorized");
    }

    removeCarrierForMultipleLoads(truck[0]);
    deleteTruck(truckID).then(res.status(204).end());
  });
});

router.delete("/", function (req, res) {
  return errors.displayErrorMessage(res, 405);
});

/* ------------- End Controller Functions ------------- */

module.exports = router;
