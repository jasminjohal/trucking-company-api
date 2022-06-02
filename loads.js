const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();

const ds = require("./datastore");
const { entity } = require("@google-cloud/datastore/build/src/entity");

const datastore = ds.datastore;

const LOAD = "Load";
const BOAT = "Boat";

router.use(bodyParser.json());

/* ------------- Begin load Model Functions ------------- */
function post_load(volume, item, creation_date) {
  var key = datastore.key(LOAD);
  const new_load = {
    volume: volume,
    carrier: null,
    item: item,
    creation_date: creation_date,
  };
  return datastore.save({ key: key, data: new_load }).then(() => {
    return key;
  });
}

function get_loads(req) {
  var q = datastore.createQuery(LOAD).limit(3);
  const results = {};
  if (Object.keys(req.query).includes("cursor")) {
    q = q.start(req.query.cursor);
  }

  return datastore.runQuery(q).then((entities) => {
    const rows = entities[0].map(ds.fromDatastore);
    // modify output so that it includes self link for each load
    results.loads = rows.map((row) => {
      if (row.carrier) {
        return {
          ...row,
          carrier: {
            ...row.carrier,
            self: `${req.protocol}://${req.get("host")}/boats/${
              row.carrier.id
            }`,
          },
          self: `${req.protocol}://${req.get("host")}/loads/${row.id}`,
        };
      } else {
        return {
          ...row,
          self: `${req.protocol}://${req.get("host")}/loads/${row.id}`,
        };
      }
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

function put_load(id, name, volume, item, creation_date) {
  const key = datastore.key([LOAD, parseInt(id, 10)]);
  const load = {
    name: name,
    volume: volume,
    carrier: null,
    item: item,
    creation_date: creation_date,
  };
  return datastore.save({ key: key, data: load });
}

function delete_load(id) {
  const key = datastore.key([LOAD, parseInt(id, 10)]);
  return datastore.delete(key);
}

// remove a load id from a boat's list of loads
function patch_boat(bid, lid) {
  const l_key = datastore.key([BOAT, parseInt(bid, 10)]);
  return datastore.get(l_key).then((boat) => {
    boat[0].loads = boat[0].loads.filter((load) => load != lid);
    return datastore.save({ key: l_key, data: boat[0] });
  });
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get("/", function (req, res) {
  const loads = get_loads(req).then((loads) => {
    res.status(200).json(loads);
  });
});

router.get("/:id", function (req, res) {
  get_item_by_id(LOAD, req.params.id).then((load) => {
    if (load[0] === undefined || load[0] === null) {
      res.status(404).json({ Error: "No load with this load_id exists" });
    } else {
      let carrier = load[0].carrier;
      if (carrier) {
        // modify output so that it includes self link for carrier
        carrier = {
          ...carrier,
          self: `${req.protocol}://${req.get("host")}/boats/${carrier.id}`,
        };
      }

      // modify output so that it includes self link for load
      res.status(200).json({
        ...load[0],
        carrier: carrier,
        self: `${req.protocol}://${req.get("host")}/loads/${load[0].id}`,
      });
    }
  });
});

router.post("/", function (req, res) {
  const volume = req.body.volume;
  const item = req.body.item;
  const creation_date = req.body.creation_date;

  // ensure body includes all 3 required attributes
  if (volume && item && creation_date) {
    post_load(volume, item, creation_date).then((key) => {
      const new_load = {
        volume: volume,
        item: item,
        carrier: null,
        creation_date: creation_date,
        id: key.id,
      };
      // modify output so that it includes self link for load
      res.status(201).send({
        ...new_load,
        self: `${req.protocol}://${req.get("host")}/loads/${key.id}`,
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
  put_load(
    req.params.id,
    req.body.name,
    req.body.volume,
    req.body.item,
    req.body.creation_date
  ).then(res.status(200).end());
});

router.delete("/:id", function (req, res) {
  const id = req.params.id;

  // check if load id exists in database
  get_item_by_id(LOAD, id).then((load) => {
    if (load[0] === undefined || load[0] === null) {
      res.status(404).json({
        Error: "No load with this load_id exists",
      });
    } else {
      let boat_id;
      // check if load is on a boat
      if (load[0].carrier) {
        boat_id = load[0].carrier.id;
      }

      delete_load(id)
        .then(() => {
          // remove load from boat's list of loads
          if (boat_id) {
            patch_boat(boat_id, id);
          }
        })
        .finally(res.status(204).end());
    }
  });
});

/* ------------- End Controller Functions ------------- */

module.exports = router;
