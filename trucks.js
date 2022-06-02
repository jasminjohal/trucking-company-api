const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();
const ds = require("./datastore");

const datastore = ds.datastore;

const BOAT = "Boat";
const LOAD = "Load";

router.use(bodyParser.json());

/* ------------- Begin Boat Model Functions ------------- */
function post_boat(name, type, length) {
  var key = datastore.key(BOAT);
  const new_boat = { name: name, type: type, length: length, loads: [] };
  return datastore.save({ key: key, data: new_boat }).then(() => {
    return key;
  });
}

function get_boats(req) {
  var q = datastore.createQuery(BOAT).limit(3);
  const results = {};
  if (Object.keys(req.query).includes("cursor")) {
    q = q.start(req.query.cursor);
  }

  return datastore.runQuery(q).then((entities) => {
    const rows = entities[0].map(ds.fromDatastore);
    // modify output so that it includes self link
    results.boats = rows.map((row) => {
      return {
        ...row,
        self: `${req.protocol}://${req.get("host")}/boats/${row.id}`,
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

function get_boat_loads(req, id) {
  const key = datastore.key([BOAT, parseInt(id, 10)]);

  return (
    datastore
      .get(key)
      .then((boats) => {
        const boat = boats[0];
        const load_keys = boat.loads.map((lid) => {
          return datastore.key([LOAD, parseInt(lid, 10)]);
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
              self: `${req.protocol}://${req.get("host")}/boats/${
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

function put_boat(id, name, type, length) {
  const key = datastore.key([BOAT, parseInt(id, 10)]);
  const boat = { name: name, type: type, length: length };
  return datastore.save({ key: key, data: boat });
}

function delete_boat(id) {
  const key = datastore.key([BOAT, parseInt(id, 10)]);
  return datastore.delete(key);
}

function put_loading(bid, lid) {
  const l_key = datastore.key([BOAT, parseInt(bid, 10)]);
  return datastore.get(l_key).then((boat) => {
    if (typeof boat[0].loads === "undefined") {
      boat[0].loads = [];
    }
    boat[0].loads.push(lid);
    return datastore.save({ key: l_key, data: boat[0] });
  });
}

// remove a load id from a boat's list of loads
function patch_boat(bid, lid) {
  const l_key = datastore.key([BOAT, parseInt(bid, 10)]);
  return datastore.get(l_key).then((boat) => {
    boat[0].loads = boat[0].loads.filter((load) => load != lid);
    return datastore.save({ key: l_key, data: boat[0] });
  });
}

// returns a modified version of a list of boats
// that includes self links for each boat and for each
// load in a boat
function add_self_links(req, boats) {
  let boats_for_output = [];
  for (let i = 0; i < boats.boats.length; i++) {
    let cur_boat = boats.boats[i];
    let modified_loads = [];

    for (let j = 0; j < cur_boat.loads.length; j++) {
      let cur_load_id = cur_boat.loads[j];
      modified_loads.push({
        id: cur_load_id,
        self: `${req.protocol}://${req.get("host")}/loads/${cur_load_id}`,
      });
    }

    boats_for_output.push({
      ...cur_boat,
      loads: modified_loads,
      self: `${req.protocol}://${req.get("host")}/boats/${cur_boat.id}`,
    });
  }

  return { boats: boats_for_output, next: boats.next };
}

// update 'carrier' property of a load entity
// set 'carrier' to null if bid is null or
// set 'carrier' to obj containing bid & boat name if not null
function patch_load(lid, bid, boat_name = null) {
  const key = datastore.key([LOAD, parseInt(lid, 10)]);
  return get_item_by_id(LOAD, lid).then((load) => {
    if (bid !== null) {
      // TODO: ADD NAME
      carrier = { id: bid, name: boat_name };
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
  const boats = get_boats(req).then((boats) => {
    res.status(200).json(add_self_links(req, boats));
  });
});

router.get("/:id", function (req, res) {
  get_item_by_id(BOAT, req.params.id).then((boat) => {
    if (boat[0] === undefined || boat[0] === null) {
      res.status(404).json({ Error: "No boat with this boat_id exists" });
    } else {
      // modify output of loads so that they include self links
      let transformed_loads = [];
      for (let i = 0; i < boat[0].loads.length; i++) {
        let cur_load = boat[0].loads[i];
        transformed_loads.push({
          id: cur_load,
          self: `${req.protocol}://${req.get("host")}/loads/${cur_load}`,
        });
      }

      // modify output so that it includes self link for boat
      res.status(200).json({
        ...boat[0],
        loads: transformed_loads,
        self: `${req.protocol}://${req.get("host")}/boats/${boat[0].id}`,
      });
    }
  });
});

router.get("/:id/loads", function (req, res) {
  const id = req.params.id;

  // check if boat id exists in database
  get_item_by_id(BOAT, id).then((boat) => {
    if (boat[0] === undefined || boat[0] === null) {
      res.status(404).json({
        Error: "No boat with this boat_id exists",
      });
    } else {
      get_boat_loads(req, id).then((loads) => {
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

router.post("/", function (req, res) {
  const name = req.body.name;
  const type = req.body.type;
  const length = req.body.length;

  // ensure body includes all 3 required attributes
  if (name && type && length) {
    post_boat(name, type, length).then((key) => {
      const new_boat = {
        name: name,
        type: type,
        length: length,
        loads: [],
        id: key.id,
      };
      // modify output so that it includes self link for boat
      res.status(201).send({
        ...new_boat,
        self: `${req.protocol}://${req.get("host")}/boats/${key.id}`,
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
  put_boat(req.params.id, req.body.name, req.body.type, req.body.length).then(
    res.status(200).end()
  );
});

router.put("/:bid/loads/:lid", function (req, res) {
  const boat_id = req.params.bid;
  const load_id = req.params.lid;

  // check if boat id exists in database
  get_item_by_id(BOAT, boat_id).then((boat) => {
    if (boat[0] === undefined || boat[0] === null) {
      res
        .status(404)
        .json({ Error: "The specified boat and/or load does not exist" });
    } else {
      // check if load id exists in database
      get_item_by_id(LOAD, load_id).then((load) => {
        if (load[0] === undefined || load[0] === null) {
          res
            .status(404)
            .json({ Error: "The specified boat and/or load does not exist" });
        } else {
          // check if load hasn't already been assigned to a boat
          if (!boat[0].loads.includes(load_id) && load[0].carrier === null) {
            // update boat's list of loads to include this load
            put_loading(boat_id, load_id).then(() => {
              // update load's 'carrier' property to this boat
              patch_load(load_id, boat_id, boat[0].name).then(
                res.status(204).end()
              );
            });
          } else {
            res
              .status(403)
              .json({ Error: "The load is already loaded on another boat" });
          }
        }
      });
    }
  });
});

router.delete("/:bid/loads/:lid", function (req, res) {
  const error_msg_404 =
    "No boat with this boat_id is loaded with the load with this load_id";
  const boat_id = req.params.bid;
  const load_id = req.params.lid;

  // check if boat id exists in database
  get_item_by_id(BOAT, boat_id).then((boat) => {
    if (boat[0] === undefined || boat[0] === null) {
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
          // check if load is actually on boat
          if (
            boat[0].loads.includes(load_id) &&
            load[0] !== null &&
            load[0].carrier.id === boat_id
          ) {
            // remove load from boat's 'loads' property
            patch_boat(req.params.bid, req.params.lid).then(
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

  // check if boat id exists in database
  get_item_by_id(BOAT, id).then((boat) => {
    if (boat[0] === undefined || boat[0] === null) {
      res.status(404).json({
        Error: "No boat with this boat_id exists",
      });
    } else {
      // unassign all loads on this boat
      let promises = [];
      for (let i = 0; i < boat[0].loads.length; i++) {
        let cur_load = boat[0].loads[i];
        promises.push(patch_load(cur_load, null));
      }

      Promise.all(promises).then(() => {
        delete_boat(id).then(res.status(204).end());
      });
    }
  });
});

/* ------------- End Controller Functions ------------- */

module.exports = router;
