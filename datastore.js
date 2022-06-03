const { Datastore } = require("@google-cloud/datastore");
const TRUCK = "Truck";

const datastore = new Datastore();
const fromDatastore = function (item) {
  item.id = item[Datastore.KEY].id;
  return item;
};

// returns an entity in a kind corresponding to the passed id
const getEntityByID = function (kind, id) {
  const key = datastore.key([kind, parseInt(id, 10)]);
  return datastore.get(key).then((entity) => {
    if (entity[0] === undefined || entity[0] === null) {
      return entity;
    } else {
      return entity.map(fromDatastore);
    }
  });
};

// returns list of entities in kind
const getEntitiesInKind = function (kind) {
  const q = datastore.createQuery(kind);
  return datastore.runQuery(q).then((entities) => {
    return entities[0].map(fromDatastore);
  });
};

const hasFalsyValue = function (arr) {
  for (const el of arr) {
    if (!el) {
      return true;
    }
  }
  return false;
};

function getFiveEntities(kind, req, num_entities, endpoint) {
  // only display max 5 entities at a time
  var q = datastore.createQuery(kind).limit(5);
  const results = {};
  if (Object.keys(req.query).includes("cursor")) {
    q = q.start(req.query.cursor);
  }

  return datastore.runQuery(q).then((entities) => {
    const rows = entities[0].map(fromDatastore);
    // modify output so that it includes total number of entities in kind & self link for each truck
    results.total_entities = num_entities;
    if (endpoint === "trucks") {
      results.data = rows.map((row) => {
        return {
          ...row,
          self: `${req.protocol}://${req.get("host")}/${endpoint}/${row.id}`,
        };
      });
    } else if (endpoint === "loads") {
      results.data = rows.map((row) => {
        if (row.carrier) {
          console.log(row.carrier);
          return {
            ...row,
            carrier: {
              id: row.carrier,
              self: `${req.protocol}://${req.get("host")}/trucks/${
                row.carrier
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
    }

    if (entities[1].moreResults !== Datastore.NO_MORE_RESULTS) {
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

// remove a load id from a truck's list of loads
function removeLoadFromTruck(truck_id, load_id) {
  const l_key = datastore.key([TRUCK, parseInt(truck_id, 10)]);
  return datastore.get(l_key).then((truck) => {
    truck[0].loads = truck[0].loads.filter((load) => load != load_id);
    return datastore.save({ key: l_key, data: truck[0] });
  });
}

module.exports.Datastore = Datastore;
module.exports.datastore = datastore;
module.exports.fromDatastore = fromDatastore;
module.exports.getEntityByID = getEntityByID;
module.exports.getEntitiesInKind = getEntitiesInKind;
module.exports.hasFalsyValue = hasFalsyValue;
module.exports.getFiveEntities = getFiveEntities;
module.exports.removeLoadFromTruck = removeLoadFromTruck;
