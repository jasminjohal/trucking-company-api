const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();

const ds = require("./datastore");
const { entity } = require("@google-cloud/datastore/build/src/entity");

const datastore = ds.datastore;

const LOAD = "Load";
const TRUCK = "Truck";

router.use(bodyParser.json());

/* ------------- Begin load Model Functions ------------- */

// add a new load entity
function post_load(vendor, item, quantity, weight) {
  var key = datastore.key(LOAD);
  const new_truck = {
    vendor,
    item,
    quantity,
    weight,
    carrier: null,
  };
  return datastore.save({ key: key, data: new_truck }).then(() => {
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
            self: `${req.protocol}://${req.get("host")}/trucks/${
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
// function get_entity_by_id(kind, id) {
//   const key = datastore.key([kind, parseInt(id, 10)]);
//   return datastore.get(key).then((entity) => {
//     if (entity[0] === undefined || entity[0] === null) {
//       return entity;
//     } else {
//       return entity.map(ds.fromDatastore);
//     }
//   });
// }

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

// remove a load id from a truck's list of loads
function patch_truck(bid, lid) {
  const l_key = datastore.key([TRUCK, parseInt(bid, 10)]);
  return datastore.get(l_key).then((truck) => {
    truck[0].loads = truck[0].loads.filter((load) => load != lid);
    return datastore.save({ key: l_key, data: truck[0] });
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
  ds.getEntityByID(LOAD, req.params.id).then((load) => {
    if (load[0] === undefined || load[0] === null) {
      res.status(404).json({ Error: "No load with this load_id exists" });
    } else {
      let carrier = load[0].carrier;
      if (carrier) {
        // modify output so that it includes self link for carrier
        carrier = {
          ...carrier,
          self: `${req.protocol}://${req.get("host")}/trucks/${carrier.id}`,
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

function hasFalsyValue(arr) {
  for (const el of arr) {
    if (!el) {
      return true;
    }
  }
  return false;
}

router.post("/", function (req, res) {
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

  // ignore any extraneous attributes by only extracting relevant values from request
  const load_values = [
    req.body.vendor,
    req.body.item,
    req.body.quantity,
    req.body.weight,
  ];

  // ensure all required attributes are included in the request
  if (!hasFalsyValue(load_values)) {
    post_load(...load_values).then((key) => {
      // get the truck that was just created
      ds.getEntityByID(LOAD, key.id).then((load) => {
        res.status(201).send({
          ...load[0],
          // modify reponse to include self link for truck
          self: `${req.protocol}://${req.get("host")}/loads/${key.id}`,
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
  ds.getEntityByID(LOAD, id).then((load) => {
    if (load[0] === undefined || load[0] === null) {
      res.status(404).json({
        Error: "No load with this load_id exists",
      });
    } else {
      let truck_id;
      // check if load is on a truck
      if (load[0].carrier) {
        truck_id = load[0].carrier.id;
      }

      delete_load(id)
        .then(() => {
          // remove load from truck's list of loads
          if (truck_id) {
            patch_truck(truck_id, id);
          }
        })
        .finally(res.status(204).end());
    }
  });
});

/* ------------- End Controller Functions ------------- */

module.exports = router;
