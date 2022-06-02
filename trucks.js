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
    company_id: company_id,
    truck_vin: truck_vin,
    trailer_vin: trailer_vin,
    truck_model: truck_model,
    trailer_type: trailer_type,
    trailer_capacity: trailer_capacity,
    loads: [],
  };
  return datastore.save({ key: key, data: new_truck }).then(() => {
    return key;
  });
}

function get_trucks(req) {
  // only display max 5 trucks at at ime
  var q = datastore.createQuery(TRUCK).limit(5);
  const results = {};
  if (Object.keys(req.query).includes("cursor")) {
    q = q.start(req.query.cursor);
  }

  return datastore.runQuery(q).then((entities) => {
    const rows = entities[0].map(ds.fromDatastore);
    console.log(rows.length); // TODO: add length property
    // modify output so that it includes self link
    results.trucks = rows.map((row) => {
      return {
        ...row,
        self: `${req.protocol}://${req.get("host")}/trucks/${row.id}`,
      };
    });

    if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
      results.next =
        req.protocol +
        "://" +
        req.get("host") +
        req.baseUrl +
        "?cursor=" +
        entities[1].endCursor;
    }
    return results;
  });
}

// returns an entity in a kind corresponding to the passed id
function get_item_by_id(kind, id) {
  const key = datastore.key([kind, parseInt(id, 10)]);
  return datastore.get(key).then((entity) => {
    if (entity[0] === undefined || entity[0] === null) {
      return entity;
    } else {
      return entity.map(ds.fromDatastore);
    }
  });
}

function get_truck_loads(req, id) {
  const key = datastore.key([TRUCK, parseInt(id, 10)]);

  return (
    datastore
      .get(key)
      .then((trucks) => {
        const truck = trucks[0];
        const load_keys = truck.loads.map((load_id) => {
          return datastore.key([LOAD, parseInt(load_id, 10)]);
        });
        return datastore.get(load_keys);
      })
      .then((loads) => {
        loads = loads[0].map(ds.fromDatastore);
        return loads.map((load) => {
          // modify output so that each carrier contains a self link
          return {
            ...load,
            carrier: {
              ...load.carrier,
              self: `${req.protocol}://${req.get("host")}/trucks/${
                load.carrier.id
              }`,
            },
          };
        });
      })
      // handle case where there are no loads
      .catch(() => {
        return [];
      })
  );
}

function put_truck(id, name, type, length) {
  const key = datastore.key([TRUCK, parseInt(id, 10)]);
  const truck = { name: name, type: type, length: length };
  return datastore.save({ key: key, data: truck });
}

function delete_truck(id) {
  const key = datastore.key([TRUCK, parseInt(id, 10)]);
  return datastore.delete(key);
}

function put_loading(truck_id, load_id) {
  const l_key = datastore.key([TRUCK, parseInt(truck_id, 10)]);
  return datastore.get(l_key).then((truck) => {
    if (typeof truck[0].loads === "undefined") {
      truck[0].loads = [];
    }
    truck[0].loads.push(load_id);
    return datastore.save({ key: l_key, data: truck[0] });
  });
}

// remove a load id from a truck's list of loads
function patch_truck(truck_id, load_id) {
  const l_key = datastore.key([TRUCK, parseInt(truck_id, 10)]);
  return datastore.get(l_key).then((truck) => {
    truck[0].loads = truck[0].loads.filter((load) => load != load_id);
    return datastore.save({ key: l_key, data: truck[0] });
  });
}

// returns a modified version of a list of trucks
// that includes self links for each truck and for each
// load in a truck
function add_self_links(req, trucks) {
  let trucks_for_output = [];
  for (let i = 0; i < trucks.trucks.length; i++) {
    let cur_truck = trucks.trucks[i];
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

  return { trucks: trucks_for_output, next: trucks.next };
}

// update 'carrier' property of a load entity
// set 'carrier' to null if truck_id is null or
// set 'carrier' to obj containing truck_id & truck name if not null
function patch_load(load_id, truck_id, truck_name = null) {
  const key = datastore.key([LOAD, parseInt(load_id, 10)]);
  return get_item_by_id(LOAD, load_id).then((load) => {
    if (truck_id !== null) {
      carrier = { id: truck_id, name: truck_name };
    } else {
      carrier = null;
    }

    const modified_load = {
      volume: load[0].volume,
      item: load[0].item,
      creation_date: load[0].creation_date,
      carrier: carrier,
    };

    return datastore.save({ key: key, data: modified_load });
  });
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get("/", function (req, res) {
  const trucks = get_trucks(req).then((trucks) => {
    res.status(200).json(add_self_links(req, trucks));
  });
});

router.get("/:id", function (req, res) {
  get_item_by_id(TRUCK, req.params.id).then((truck) => {
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

router.get("/:id/loads", function (req, res) {
  const id = req.params.id;

  // check if truck id exists in database
  get_item_by_id(TRUCK, id).then((truck) => {
    if (truck[0] === undefined || truck[0] === null) {
      res.status(404).json({
        Error: "No truck with this truck_id exists",
      });
    } else {
      get_truck_loads(req, id).then((loads) => {
        // modify output so that it includes self link for each load
        let modified_loads = loads.map((load) => {
          return {
            ...load,
            self: `${req.protocol}://${req.get("host")}/loads/${load.id}`,
          };
        });
        res.status(200).json({ loads: modified_loads });
      });
    }
  });
});

function hasFalsyValue(obj) {
  for (let key in obj) {
    if (!obj[key]) {
      return true;
    }
  }
  return false;
}

router.post("/", function (req, res) {
  const {
    company_id,
    truck_vin,
    trailer_vin,
    truck_model,
    trailer_type,
    trailer_capacity,
  } = req.body;

  const new_truck = {
    company_id,
    truck_vin,
    trailer_vin,
    truck_model,
    trailer_type,
    trailer_capacity,
  };

  // ensure all required attributes are included in the request
  if (!hasFalsyValue(new_truck)) {
    post_truck(
      new_truck.company_id,
      new_truck.truck_vin,
      new_truck.trailer_vin,
      new_truck.truck_model,
      new_truck.trailer_type,
      new_truck.trailer_capacity
    ).then((key) => {
      // modify reponse to mimic entity in db & to include self link for truck
      new_truck.loads = [];
      new_truck.id = key.id;
      new_truck.self = `${req.protocol}://${req.get("host")}/trucks/${key.id}`;
      res.status(201).send(new_truck);
    });
  } else {
    res.status(400).json({
      Error:
        "The request object is missing at least one of the required attributes",
    });
  }
});

router.put("/:id", function (req, res) {
  put_truck(req.params.id, req.body.name, req.body.type, req.body.length).then(
    res.status(200).end()
  );
});

router.put("/:truck_id/loads/:load_id", function (req, res) {
  const truck_id = req.params.truck_id;
  const load_id = req.params.load_id;

  // check if truck id exists in database
  get_item_by_id(TRUCK, truck_id).then((truck) => {
    if (truck[0] === undefined || truck[0] === null) {
      res
        .status(404)
        .json({ Error: "The specified truck and/or load does not exist" });
    } else {
      // check if load id exists in database
      get_item_by_id(LOAD, load_id).then((load) => {
        if (load[0] === undefined || load[0] === null) {
          res
            .status(404)
            .json({ Error: "The specified truck and/or load does not exist" });
        } else {
          // check if load hasn't already been assigned to a truck
          if (!truck[0].loads.includes(load_id) && load[0].carrier === null) {
            // update truck's list of loads to include this load
            put_loading(truck_id, load_id).then(() => {
              // update load's 'carrier' property to this truck
              patch_load(load_id, truck_id, truck[0].name).then(
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
  get_item_by_id(TRUCK, truck_id).then((truck) => {
    if (truck[0] === undefined || truck[0] === null) {
      res.status(404).json({
        Error: error_msg_404,
      });
    } else {
      // check if load id exists in database
      get_item_by_id(LOAD, load_id).then((load) => {
        if (load[0] === undefined || load[0] === null) {
          res.status(404).json({
            Error: error_msg_404,
          });
        } else {
          // check if load is actually on truck
          if (
            truck[0].loads.includes(load_id) &&
            load[0] !== null &&
            load[0].carrier.id === truck_id
          ) {
            // remove load from truck's 'loads' property
            patch_truck(truck_id, load_id).then(
              // nullify this load's 'carrier' property
              patch_load(load_id, null).then(res.status(204).end())
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
  get_item_by_id(TRUCK, id).then((truck) => {
    if (truck[0] === undefined || truck[0] === null) {
      res.status(404).json({
        Error: "No truck with this truck_id exists",
      });
    } else {
      // unassign all loads on this truck
      let promises = [];
      for (let i = 0; i < truck[0].loads.length; i++) {
        let cur_load = truck[0].loads[i];
        promises.push(patch_load(cur_load, null));
      }

      Promise.all(promises).then(() => {
        delete_truck(id).then(res.status(204).end());
      });
    }
  });
});

/* ------------- End Controller Functions ------------- */

module.exports = router;
