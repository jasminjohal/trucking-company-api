const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();
const ds = require("./datastore");

const datastore = ds.datastore;

const TRUCK = "Truck";
const LOAD = "Load";

router.use(bodyParser.json());

/* ------------- Begin Truck Model Functions ------------- */

// add a new truck entity
function post_truck(
  company_id,
  truck_vin,
  trailer_vin,
  truck_model,
  trailer_type,
  trailer_capacity
) {
  var key = datastore.key(TRUCK);
  const new_truck = {
    company_id,
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

function put_truck(
  id,
  company_id,
  truck_vin,
  trailer_vin,
  truck_model,
  trailer_type,
  trailer_capacity
) {
  const key = datastore.key([TRUCK, parseInt(id, 10)]);
  const truck = {
    // TODO: SHOULD THIS IMPACT USERS TABLE
    company_id,
    truck_vin,
    trailer_vin,
    truck_model,
    trailer_type,
    trailer_capacity,
    loads: [],
  };
  return datastore.save({ key: key, data: truck });
}

function patch_truck(
  id,
  company_id = null,
  truck_vin = null,
  trailer_vin = null,
  truck_model = null,
  trailer_type = null,
  trailer_capacity = null
) {
  const l_key = datastore.key([TRUCK, parseInt(id, 10)]);

  return datastore.get(l_key).then((truck) => {
    // TODO: SHOULD THIS IMPACT USERS TABLE
    truck[0].company_id = company_id ?? truck[0].company_id;
    truck[0].truck_vin = truck_vin ?? truck[0].truck_vin;
    truck[0].trailer_vin = trailer_vin ?? truck[0].trailer_vin;
    truck[0].truck_model = truck_model ?? truck[0].truck_model;
    truck[0].trailer_type = trailer_type ?? truck[0].trailer_type;
    truck[0].trailer_capacity = trailer_capacity ?? truck[0].trailer_capacity;
    return datastore.save({ key: l_key, data: truck[0] });
  });
}

function delete_truck(id) {
  const key = datastore.key([TRUCK, parseInt(id, 10)]);
  return datastore.delete(key);
}

function patch_truck_add_load(truck_id, load_id) {
  const l_key = datastore.key([TRUCK, parseInt(truck_id, 10)]);
  return datastore.get(l_key).then((truck) => {
    if (typeof truck[0].loads === "undefined") {
      truck[0].loads = [];
    }
    truck[0].loads.push(load_id);
    return datastore.save({ key: l_key, data: truck[0] });
  });
}

// returns a modified version of a list of trucks
// that includes self links for each truck and for each
// load in a truck
function add_self_links(req, trucks) {
  let trucks_for_output = [];
  for (let i = 0; i < trucks.data.length; i++) {
    let cur_truck = trucks.data[i];
    let modified_loads = [];

    for (let j = 0; j < cur_truck.loads.length; j++) {
      let cur_load_id = cur_truck.loads[j];
      modified_loads.push({
        id: cur_load_id,
        self: `${req.protocol}://${req.get("host")}/loads/${cur_load_id}`,
      });
    }

    trucks_for_output.push({
      ...cur_truck,
      loads: modified_loads,
      self: `${req.protocol}://${req.get("host")}/trucks/${cur_truck.id}`,
    });
  }

  return {
    data: trucks_for_output,
    next: trucks.next,
    total_entities: trucks.total_entities,
  };
}

// update 'carrier' property of a load entity
// set 'carrier' to null if truck_id is null or
// set 'carrier' to obj containing truck_id & truck name if not null
function patch_load_modify_carrier(load_id, truck_id) {
  const key = datastore.key([LOAD, parseInt(load_id, 10)]);
  return ds.getEntityByID(LOAD, load_id).then((load) => {
    const patched_load = {
      vendor: load[0].vendor,
      item: load[0].item,
      quantity: load[0].quantity,
      weight: load[0].weight,
      carrier: truck_id,
    };

    return datastore.save({ key: key, data: patched_load });
  });
}

function removeCarrierForMultipleLoads(truck) {
  let promises = [];
  for (let i = 0; i < truck.loads.length; i++) {
    let cur_load = truck.loads[i];
    promises.push(patch_load_modify_carrier(cur_load, null));
  }

  Promise.all(promises);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get("/", function (req, res) {
  const accepts = req.accepts(["application/json"]);
  if (!accepts) {
    return res.status(406).json({
      Error: "This application only supports JSON responses",
    });
  }

  ds.getEntitiesInKind(TRUCK).then((trucks) => {
    const num_trucks = trucks.length;
    ds.getFiveEntities(TRUCK, req, num_trucks, "trucks").then((trucks) => {
      res.status(200).json(add_self_links(req, trucks));
    });
  });
});

router.get("/:id", function (req, res) {
  const accepts = req.accepts(["application/json"]);
  if (!accepts) {
    return res.status(406).json({
      Error: "This application only supports JSON responses",
    });
  }

  ds.getEntityByID(TRUCK, req.params.id).then((truck) => {
    if (truck[0] === undefined || truck[0] === null) {
      res.status(404).json({ Error: "No truck with this truck_id exists" });
    } else {
      // modify output of loads so that they include self links
      let transformed_loads = [];
      for (let i = 0; i < truck[0].loads.length; i++) {
        let cur_load = truck[0].loads[i];
        transformed_loads.push({
          id: cur_load,
          self: `${req.protocol}://${req.get("host")}/loads/${cur_load}`,
        });
      }

      // modify output so that it includes self link for truck
      res.status(200).json({
        ...truck[0],
        loads: transformed_loads,
        self: `${req.protocol}://${req.get("host")}/trucks/${truck[0].id}`,
      });
    }
  });
});

router.post("/", function (req, res) {
  // reject requests that aren't JSON
  if (req.get("content-type") !== "application/json") {
    return res
      .status(415)
      .json({ Error: "Server only accepts application/json data." });
  }

  // ignore any extraneous attributes by only extracting relevant values from request
  const truck_values = [
    req.body.company_id,
    req.body.truck_vin,
    req.body.trailer_vin,
    req.body.truck_model,
    req.body.trailer_type,
    req.body.trailer_capacity,
  ];

  // ensure all required attributes are included in the request
  if (!ds.hasFalsyValue(truck_values)) {
    post_truck(...truck_values).then((key) => {
      // get the truck that was just created
      ds.getEntityByID(TRUCK, key.id).then((truck) => {
        res.status(201).send({
          ...truck[0],
          // modify reponse to include self link for truck
          self: `${req.protocol}://${req.get("host")}/trucks/${key.id}`,
        });
      });
    });
  } else {
    res.status(400).json({
      Error:
        "The request object is missing at least one of the required attributes",
    });
  }
});

router.put("/:id", function (req, res) {
  // reject requests that aren't JSON
  if (req.get("content-type") !== "application/json") {
    return res
      .status(415)
      .json({ Error: "Server only accepts application/json data." });
  }

  const accepts = req.accepts(["application/json"]);
  if (!accepts) {
    return res.status(406).json({
      Error: "This application only supports JSON responses",
    });
  }

  const truck_id = req.params.id;

  ds.getEntityByID(TRUCK, truck_id).then((truck) => {
    if (truck[0] === undefined || truck[0] === null) {
      res.status(404).json({ Error: "No truck with this truck_id exists" });
    } else {
      // ignore any extraneous attributes by only extracting relevant values from request
      const truck_values = [
        req.body.company_id,
        req.body.truck_vin,
        req.body.trailer_vin,
        req.body.truck_model,
        req.body.trailer_type,
        req.body.trailer_capacity,
      ];

      // ensure all required attributes are included in the request
      if (!ds.hasFalsyValue(truck_values)) {
        removeCarrierForMultipleLoads(truck[0]);
        put_truck(truck_id, ...truck_values).then(() => {
          // get the truck that was just modified
          ds.getEntityByID(TRUCK, truck_id).then((truck) => {
            res.status(200).send({
              ...truck[0],
              // modify reponse to include self link for truck
              self: `${req.protocol}://${req.get("host")}/trucks/${truck_id}`,
            });
          });
        });
      } else {
        res.status(400).json({
          Error:
            "The request object is missing at least one of the required attributes",
        });
      }
    }
  });
});

router.patch("/:id", function (req, res) {
  // reject requests that aren't JSON
  if (req.get("content-type") !== "application/json") {
    return res
      .status(415)
      .json({ Error: "Server only accepts application/json data." });
  }

  const accepts = req.accepts(["application/json"]);
  if (!accepts) {
    return res.status(406).json({
      Error: "This application only supports JSON responses",
    });
  }

  const truck_id = req.params.id;

  ds.getEntityByID(TRUCK, truck_id).then((truck) => {
    if (truck[0] === undefined || truck[0] === null) {
      res.status(404).json({ Error: "No truck with this truck_id exists" });
    } else {
      // ignore any extraneous attributes by only extracting relevant values from request
      const truck_values = [
        req.body.company_id,
        req.body.truck_vin,
        req.body.trailer_vin,
        req.body.truck_model,
        req.body.trailer_type,
        req.body.trailer_capacity,
      ];

      // ensure all required attributes are included in the request
      if (ds.hasTruthyValue(truck_values)) {
        patch_truck(truck_id, ...truck_values).then(() => {
          // get the truck that was just modified
          ds.getEntityByID(TRUCK, truck_id).then((truck) => {
            res.status(200).send({
              ...truck[0],
              // modify reponse to include self link for truck
              self: `${req.protocol}://${req.get("host")}/trucks/${truck_id}`,
            });
          });
        });
      } else {
        res.status(400).json({
          Error:
            "The request object is missing at least one of the required attributes",
        });
      }
    }
  });
});

router.put("/:truck_id/loads/:load_id", function (req, res) {
  const truck_id = req.params.truck_id;
  const load_id = req.params.load_id;

  // check if truck id exists in database
  ds.getEntityByID(TRUCK, truck_id).then((truck) => {
    if (truck[0] === undefined || truck[0] === null) {
      res
        .status(404)
        .json({ Error: "The specified truck and/or load does not exist" });
    } else {
      // check if load id exists in database
      ds.getEntityByID(LOAD, load_id).then((load) => {
        if (load[0] === undefined || load[0] === null) {
          res
            .status(404)
            .json({ Error: "The specified truck and/or load does not exist" });
        } else {
          // check if load hasn't already been assigned to a truck
          if (!truck[0].loads.includes(load_id) && load[0].carrier === null) {
            // update truck's list of loads to include this load
            patch_truck_add_load(truck_id, load_id).then(() => {
              // update load's 'carrier' property to this truck
              patch_load_modify_carrier(load_id, truck_id).then(
                res.status(204).end()
              );
            });
          } else {
            res
              .status(403)
              .json({ Error: "The load is already loaded on another truck" });
          }
        }
      });
    }
  });
});

router.delete("/:truck_id/loads/:load_id", function (req, res) {
  const error_msg_404 =
    "No truck with this truck_id is loaded with the load with this load_id";
  const truck_id = req.params.truck_id;
  const load_id = req.params.load_id;

  // check if truck id exists in database
  ds.getEntityByID(TRUCK, truck_id).then((truck) => {
    if (truck[0] === undefined || truck[0] === null) {
      res.status(404).json({
        Error: error_msg_404,
      });
    } else {
      // check if load id exists in database
      ds.getEntityByID(LOAD, load_id).then((load) => {
        if (load[0] === undefined || load[0] === null) {
          res.status(404).json({
            Error: error_msg_404,
          });
        } else {
          // check if load is actually on truck
          if (
            truck[0].loads.includes(load_id) &&
            load[0] !== null &&
            load[0].carrier === truck_id
          ) {
            // remove load from truck's 'loads' property
            ds.removeLoadFromTruck(truck_id, load_id).then(
              // nullify this load's 'carrier' property
              patch_load_modify_carrier(load_id, null).then(
                res.status(204).end()
              )
            );
          } else {
            res.status(404).json({
              Error: error_msg_404,
            });
          }
        }
      });
    }
  });
});

router.delete("/:id", function (req, res) {
  const id = req.params.id;

  // check if truck id exists in database
  ds.getEntityByID(TRUCK, id).then((truck) => {
    if (truck[0] === undefined || truck[0] === null) {
      res.status(404).json({
        Error: "No truck with this truck_id exists",
      });
    } else {
      removeCarrierForMultipleLoads(truck[0]);
      delete_truck(id).then(res.status(204).end());
    }
  });
});

/* ------------- End Controller Functions ------------- */

module.exports = router;
