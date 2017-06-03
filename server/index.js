const queryBuilder = require('./query-builder');
const discovery = require('./watson-developer-cloud').discovery;
const nlu = require('./watson-developer-cloud').nlu;

const WatsonNewsServer = new Promise((resolve, reject) => {
  discovery.getEnvironments({})
    .then(response => {
      const environmentId = response.environments
                                    .find(environment => environment.read_only == true)
                                    .environment_id;
      queryBuilder.setEnvironmentId(environmentId);
      return discovery.getCollections({ environment_id: environmentId });
    })
    .then(response => {
      const collectionId = response.collections[0].collection_id;
      queryBuilder.setCollectionId(collectionId);
      resolve(createServer());
    })
    .catch(error => {
      // eslint-disable-next-line no-console
      console.error(error);
      reject(error);
    });
});

function createServer() {
  const server = require('./express');

  server.get('/', function(req, res){
    res.render('index', {});
  });

  server.get('/api/search', (req, res, next) => {
    const { query } = req.query;

    nlu.analyze({
      text: query,
      features: {
        categories: {},
        relations: {}
      }
    })
    .then(response => {
      const taxonomyLabel = constructTaxonomyLabel({ categories: response.categories, query });
      const queryOpts = {
        natural_language_query: query,
        filter: taxonomyLabel ? `taxonomy.label:${taxonomyLabel},blekko.hostrank>500` : 'blekko.hostrank>500'
      };

      return discovery
        .query(queryBuilder.build(queryOpts))
        .then(response =>
          Object.assign(response, { taxonomy: taxonomyLabel.replace(/"/g, '').split(',') }));
    })
    .catch(error => {
      // eslint-disable-next-line no-console
      console.error(error);
      
      return discovery.query(queryBuilder.build({
        natural_language_query: query,
        filter: 'blekko.hostrank>500'
      }));
    })
    .then(response => res.json(response))
    .catch(error => {
      // eslint-disable-next-line no-console
      console.error(error);

      next(error);
    });
  });

  return server;
}

function constructTaxonomyLabel({ categories, query }) {
  const searchQuery = query.toLowerCase();
  return categories
    .reduce((result, category) => result.concat(category.label.split('/').slice(1)), [])
    .filter(category => searchQuery.indexOf(category) > -1)
    .map(category => `"${category}"`)
    .join(',');
}

module.exports = WatsonNewsServer;