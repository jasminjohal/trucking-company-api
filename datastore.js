const { Datastore } = require("@google-cloud/datastore");

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

module.exports.Datastore = Datastore;
module.exports.datastore = datastore;
module.exports.fromDatastore = fromDatastore;
module.exports.getEntityByID = getEntityByID;
module.exports.getEntitiesInKind = getEntitiesInKind;
module.exports.hasFalsyValue = hasFalsyValue;
