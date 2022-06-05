const { Datastore } = require("@google-cloud/datastore");
const TRUCK = "Truck";

const { expressjwt: jwt } = require("express-jwt");
const jwksRsa = require("jwks-rsa");

require("dotenv").config();

const datastore = new Datastore();
const fromDatastore = function (item) {
  item.id = item[Datastore.KEY].id;
  return item;
};

// returns an entity in a kind corresponding to the passed id
function getEntityByID(kind, id) {
  const key = datastore.key([kind, parseInt(id, 10)]);
  return datastore.get(key).then((entity) => {
    if (entity[0] === undefined || entity[0] === null) {
      return entity;
    } else {
      return entity.map(fromDatastore);
    }
  });
}

// returns list of entities in kind
function getEntitiesInKind(kind) {
  const q = datastore.createQuery(kind);
  return datastore.runQuery(q).then((entities) => {
    return entities[0].map(fromDatastore);
  });
}

// returns list of entities in kind that belong to specified owner
function getProtectedEntitiesInKind(kind, owner) {
  const q = datastore.createQuery(kind);
  return datastore.runQuery(q).then((entities) => {
    return entities[0]
      .map(fromDatastore)
      .filter((item) => item.owner === owner);
  });
}

// returns true is any of the values in the array are falsy;
// returns false otherwise
function hasFalsyValue(arr) {
  for (const el of arr) {
    if (!el) {
      return true;
    }
  }
  return false;
}

// returns true is any of the values in the array are truthy;
// returns false otherwise
function hasTruthyValue(arr) {
  for (const el of arr) {
    if (el) {
      return true;
    }
  }
  return false;
}

function convertIdToObjectWithSelfLink(id, endpoint, req) {
  return {
    id: id,
    self: `${req.protocol}://${req.get("host")}/${endpoint}/${id}`,
  };
}

function addSelfLinksToLoad(load, req) {
  const loadWithSelfLinks = {
    ...load,
    self: `${req.protocol}://${req.get("host")}/loads/${load.id}`,
  };

  if (load.carrier) {
    loadWithSelfLinks.carrier = convertIdToObjectWithSelfLink(
      load.carrier,
      "trucks",
      req
    );
  }

  return loadWithSelfLinks;
}

function addSelfLinksToTruck(truck, req) {
  const truckWithSelfLinks = {
    ...truck,
    self: `${req.protocol}://${req.get("host")}/trucks/${truck.id}`,
    loads: [],
  };

  for (let j = 0; j < truck.loads.length; j++) {
    const load_id = truck.loads[j];
    truckWithSelfLinks.loads.push(
      convertIdToObjectWithSelfLink(load_id, "loads", req)
    );
  }

  return truckWithSelfLinks;
}

function getFiveEntities(kind, req, num_entities, endpoint, owner = null) {
  // only display max 5 entities at a time
  var q = datastore.createQuery(kind).limit(5);
  const results = {};
  if (Object.keys(req.query).includes("cursor")) {
    q = q.start(req.query.cursor);
  }

  return datastore.runQuery(q).then((entities) => {
    results.total_entities = num_entities;

    if (endpoint === "trucks") {
      const rows = entities[0]
        .map(fromDatastore)
        .filter((item) => item.owner === owner);
      results.data = rows.map((row) => {
        return addSelfLinksToTruck(row, req);
      });
    } else if (endpoint === "loads") {
      const rows = entities[0].map(fromDatastore);
      results.data = rows.map((row) => {
        return addSelfLinksToLoad(row, req);
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

module.exports.Datastore = Datastore;
module.exports.datastore = datastore;
module.exports.fromDatastore = fromDatastore;
module.exports.getEntityByID = getEntityByID;
module.exports.getEntitiesInKind = getEntitiesInKind;
module.exports.getProtectedEntitiesInKind = getProtectedEntitiesInKind;
module.exports.hasFalsyValue = hasFalsyValue;
module.exports.hasTruthyValue = hasTruthyValue;
module.exports.getFiveEntities = getFiveEntities;
module.exports.addSelfLinksToLoad = addSelfLinksToLoad;
module.exports.addSelfLinksToTruck = addSelfLinksToTruck;
module.exports.removeLoadFromTruck = removeLoadFromTruck;
module.exports.checkJwt = checkJwt;
