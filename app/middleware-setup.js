const cacheControl = require('koa-cache-control');
const compress = require('koa-compress');
const flash = require('koa-better-flash');
const parser = require('koa-better-body');

module.exports = (app) => {
  // initialize flash
  app.use(flash());
  // initialize body parser
  app.use(parser());
  // initialize cache controller
  app.use(cacheControl(openopps.cache.public));
  // initialize response compression
  app.use(compress({}));
  // initialize log middleware
  require('../lib/log/middleware')(app);
};