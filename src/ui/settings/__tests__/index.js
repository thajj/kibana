import { isEqual } from 'lodash';
import sinon from 'sinon';
import expect from 'expect.js';
import init from '..';
import defaultsProvider from '../defaults';
import { errors as esErrors } from 'elasticsearch';

describe('ui settings', function () {
  describe('overview', function () {
    it('has expected api surface', function () {
      const { uiSettings } = instantiate();
      expect(typeof uiSettings.get).to.equal('function');
      expect(typeof uiSettings.getAll).to.equal('function');
      expect(typeof uiSettings.getDefaults).to.equal('function');
      expect(typeof uiSettings.getRaw).to.equal('function');
      expect(typeof uiSettings.getUserProvided).to.equal('function');
      expect(typeof uiSettings.remove).to.equal('function');
      expect(typeof uiSettings.removeMany).to.equal('function');
      expect(typeof uiSettings.set).to.equal('function');
      expect(typeof uiSettings.setMany).to.equal('function');
    });
  });

  describe('#setMany()', function () {
    it('returns a promise', () => {
      const { uiSettings, req } = instantiate();
      const result = uiSettings.setMany(req, { a: 'b' });
      expect(result).to.be.a(Promise);
    });

    it('updates a single value in one operation', function () {
      const { server, uiSettings, configGet, req } = instantiate();
      const result = uiSettings.setMany(req, { one: 'value' });
      expectElasticsearchUpdateQuery(server, req, configGet, {
        one: 'value'
      });
    });

    it('updates several values in one operation', function () {
      const { server, uiSettings, configGet, req } = instantiate();
      const result = uiSettings.setMany(req, { one: 'value', another: 'val' });
      expectElasticsearchUpdateQuery(server, req, configGet, {
        one: 'value', another: 'val'
      });
    });
  });

  describe('#set()', function () {
    it('returns a promise', () => {
      const { uiSettings, req } = instantiate();
      const result = uiSettings.set(req, 'a', 'b');
      expect(result).to.be.a(Promise);
    });

    it('updates single values by (key, value)', function () {
      const { server, uiSettings, configGet, req } = instantiate();
      const result = uiSettings.set(req, 'one', 'value');
      expectElasticsearchUpdateQuery(server, req, configGet, {
        one: 'value'
      });
    });
  });

  describe('#remove()', function () {
    it('returns a promise', () => {
      const { uiSettings, req } = instantiate();
      const result = uiSettings.remove(req, 'one');
      expect(result).to.be.a(Promise);
    });

    it('removes single values by key', function () {
      const { server, uiSettings, configGet, req } = instantiate();
      const result = uiSettings.remove(req, 'one');
      expectElasticsearchUpdateQuery(server, req, configGet, {
        one: null
      });
    });
  });

  describe('#removeMany()', function () {
    it('returns a promise', () => {
      const { uiSettings, req } = instantiate();
      const result = uiSettings.removeMany(req, ['one']);
      expect(result).to.be.a(Promise);
    });

    it('removes a single value', function () {
      const { server, uiSettings, configGet, req } = instantiate();
      const result = uiSettings.removeMany(req, ['one']);
      expectElasticsearchUpdateQuery(server, req, configGet, {
        one: null
      });
    });

    it('updates several values in one operation', function () {
      const { server, uiSettings, configGet, req } = instantiate();
      const result = uiSettings.removeMany(req, ['one', 'two', 'three']);
      expectElasticsearchUpdateQuery(server, req, configGet, {
        one: null, two: null, three: null
      });
    });
  });

  describe('#getDefaults()', function () {
    it('is promised the default values', async function () {
      const {server, uiSettings, configGet} = instantiate();
      const defaults = await uiSettings.getDefaults();
      expect(isEqual(defaults, defaultsProvider())).to.equal(true);
    });


    describe('defaults for formatters', async function () {

      const defaults = defaultsProvider();
      const mapping = JSON.parse(defaults['format:defaultTypeMap'].value);
      const expected = {
        ip: {id: 'ip', params: {}},
        date: {id: 'date', params: {}},
        number: {id: 'number', params: {}},
        boolean: {id: 'boolean', params: {}},
        _source: {id: '_source', params: {}},
        _default_: {id: 'string', params: {}}
      };

      Object.keys(mapping).forEach(function (dataType) {
        it(`should configure ${dataType}`, function () {
          expect(expected.hasOwnProperty(dataType)).to.equal(true);
          expect(mapping[dataType].id).to.equal(expected[dataType].id);
          expect(JSON.stringify(mapping[dataType].params)).to.equal(JSON.stringify(expected[dataType].params));
        });
      });
    });
  });

  describe('#getUserProvided()', function () {
    it('pulls user configuration from ES', async function () {
      const getResult = { user: 'customized' };
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getUserProvided(req);
      expectElasticsearchGetQuery(server, req, configGet);
    });

    it('returns user configuration', async function () {
      const getResult = { user: 'customized' };
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getUserProvided(req);
      expect(isEqual(result, {
        user: { userValue: 'customized' }
      })).to.equal(true);
    });

    it('ignores null user configuration (because default values)', async function () {
      const getResult = { user: 'customized', usingDefault: null, something: 'else' };
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getUserProvided(req);
      expect(isEqual(result, {
        user: { userValue: 'customized' }, something: { userValue: 'else' }
      })).to.equal(true);
    });

    it('returns an empty object on 404 responses', async function () {
      const { uiSettings, req } = instantiate({
        async callWithRequest() {
          throw new esErrors[404]();
        }
      });

      expect(await uiSettings.getUserProvided(req)).to.eql({});
    });

    it('returns an empty object on 403 responses', async function () {
      const { uiSettings, req } = instantiate({
        async callWithRequest() {
          throw new esErrors[403]();
        }
      });

      expect(await uiSettings.getUserProvided(req)).to.eql({});
    });

    it('returns an empty object on NoConnections responses', async function () {
      const { uiSettings, req } = instantiate({
        async callWithRequest() {
          throw new esErrors.NoConnections();
        }
      });

      expect(await uiSettings.getUserProvided(req)).to.eql({});
    });

    it('throws 401 errors', async function () {
      const { uiSettings, req } = instantiate({
        async callWithRequest() {
          throw new esErrors[401]();
        }
      });

      try {
        await uiSettings.getUserProvided(req);
        throw new Error('expect getUserProvided() to throw');
      } catch (err) {
        expect(err).to.be.a(esErrors[401]);
      }
    });

    it('throw when callWithRequest fails in some unexpected way', async function () {
      const expectedUnexpectedError = new Error('unexpected');

      const { uiSettings, req } = instantiate({
        async callWithRequest() {
          throw expectedUnexpectedError;
        }
      });

      try {
        await uiSettings.getUserProvided(req);
        throw new Error('expect getUserProvided() to throw');
      } catch (err) {
        expect(err).to.be(expectedUnexpectedError);
      }
    });
  });

  describe('#getRaw()', function () {
    it('pulls user configuration from ES', async function () {
      const getResult = {};
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getRaw(req);
      expectElasticsearchGetQuery(server, req, configGet);
    });

    it(`without user configuration it's equal to the defaults`, async function () {
      const getResult = {};
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getRaw(req);
      expect(isEqual(result, defaultsProvider())).to.equal(true);
    });

    it(`user configuration gets merged with defaults`, async function () {
      const getResult = { foo: 'bar' };
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getRaw(req);
      const merged = defaultsProvider();
      merged.foo = { userValue: 'bar' };
      expect(isEqual(result, merged)).to.equal(true);
    });

    it(`user configuration gets merged into defaults`, async function () {
      const getResult = { dateFormat: 'YYYY-MM-DD' };
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getRaw(req);
      const merged = defaultsProvider();
      merged.dateFormat.userValue = 'YYYY-MM-DD';
      expect(isEqual(result, merged)).to.equal(true);
    });
  });

  describe('#getAll()', function () {
    it('pulls user configuration from ES', async function () {
      const getResult = {};
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getAll(req);
      expectElasticsearchGetQuery(server, req, configGet);
    });

    it(`returns key value pairs`, async function () {
      const getResult = {};
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getAll(req);
      const defaults = defaultsProvider();
      const expectation = {};
      Object.keys(defaults).forEach(key => {
        expectation[key] = defaults[key].value;
      });
      expect(isEqual(result, expectation)).to.equal(true);
    });

    it(`returns key value pairs including user configuration`, async function () {
      const getResult = { something: 'user-provided' };
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getAll(req);
      const defaults = defaultsProvider();
      const expectation = {};
      Object.keys(defaults).forEach(key => {
        expectation[key] = defaults[key].value;
      });
      expectation.something = 'user-provided';
      expect(isEqual(result, expectation)).to.equal(true);
    });

    it(`returns key value pairs including user configuration for existing settings`, async function () {
      const getResult = { dateFormat: 'YYYY-MM-DD' };
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.getAll(req);
      const defaults = defaultsProvider();
      const expectation = {};
      Object.keys(defaults).forEach(key => {
        expectation[key] = defaults[key].value;
      });
      expectation.dateFormat = 'YYYY-MM-DD';
      expect(isEqual(result, expectation)).to.equal(true);
    });
  });

  describe('#get()', function () {
    it('pulls user configuration from ES', async function () {
      const getResult = {};
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.get(req);
      expectElasticsearchGetQuery(server, req, configGet);
    });

    it(`returns the promised value for a key`, async function () {
      const getResult = {};
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.get(req, 'dateFormat');
      const defaults = defaultsProvider();
      expect(result).to.equal(defaults.dateFormat.value);
    });

    it(`returns the user-configured value for a custom key`, async function () {
      const getResult = { custom: 'value' };
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.get(req, 'custom');
      expect(result).to.equal('value');
    });

    it(`returns the user-configured value for a modified key`, async function () {
      const getResult = { dateFormat: 'YYYY-MM-DD' };
      const { server, uiSettings, configGet, req } = instantiate({ getResult });
      const result = await uiSettings.get(req, 'dateFormat');
      expect(result).to.equal('YYYY-MM-DD');
    });
  });
});

function expectElasticsearchGetQuery(server, req, configGet) {
  const { callWithRequest } = server.plugins.elasticsearch;
  sinon.assert.calledOnce(callWithRequest);
  const [reqPassed, method, params] = callWithRequest.args[0];
  expect(reqPassed).to.be(req);
  expect(method).to.be('get');
  expect(params).to.eql({
    index: configGet('kibana.index'),
    id: configGet('pkg.version'),
    type: 'config'
  });
}

function expectElasticsearchUpdateQuery(server, req, configGet, doc) {
  const { callWithRequest } = server.plugins.elasticsearch;
  sinon.assert.calledOnce(callWithRequest);
  const [reqPassed, method, params] = callWithRequest.args[0];
  expect(reqPassed).to.be(req);
  expect(method).to.be('update');
  expect(params).to.eql({
    index: configGet('kibana.index'),
    id: configGet('pkg.version'),
    type: 'config',
    body: { doc }
  });
}

function instantiate({ getResult, callWithRequest } = {}) {
  const esStatus = {
    state: 'green',
    on: sinon.spy()
  };
  const settingsStatus = {
    state: 'green',
    red: sinon.spy(),
    yellow: sinon.spy(),
    green: sinon.spy()
  };
  const kbnServer = {
    status: {
      create: sinon.stub().withArgs('ui settings').returns(settingsStatus),
      getForPluginId: sinon.stub().withArgs('elasticsearch').returns(esStatus)
    },
    ready: sinon.stub().returns(Promise.resolve())
  };
  const req = { __stubHapiRequest: true, path: '', headers: {} };
  const server = {
    decorate: (_, key, value) => server[key] = value,
    plugins: {
      elasticsearch: {
        errors: esErrors,
        callWithRequest: sinon.spy((withReq, method, params) => {
          if (callWithRequest) {
            return callWithRequest(withReq, method, params);
          }

          expect(withReq).to.be(req);
          switch (method) {
            case 'get':
              return Promise.resolve({ _source: getResult });
            case 'update':
              return Promise.resolve();
            default:
              throw new Error(`callWithRequest() is using unexpected method "${method}"`);
          }
        })
      }
    }
  };
  const configGet = sinon.stub();
  configGet.withArgs('kibana.index').returns('.kibana');
  configGet.withArgs('pkg.version').returns('1.2.3-test');
  configGet.withArgs('uiSettings.enabled').returns(true);
  const config = {
    get: configGet
  };
  const setupSettings = init(kbnServer, server, config);
  const uiSettings = server.uiSettings();
  return { server, uiSettings, configGet, req };
}
