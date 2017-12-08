const db = require('../../db');
const dao = require('./dao')(db);
const log = require('blue-ox')('app:user:service');
const bcrypt = require('bcryptjs');
const _ = require('lodash');
const User = require('../model/User');

async function list () {
  return dao.clean.users(await dao.User.query(dao.query.user, {}, dao.options.user));
}

async function findOne (id) {
  return await dao.User.findOne('id = ?', id);
}

async function findOneByUsername (username, done) {
  await dao.User.find('username = ?', username).then(users => {
    done(null, users[0]);
  }).catch(err => {
    done(err);
  });
}

async function isUsernameUsed (id, username) {
  return await dao.User.find('id != ? and username = ?', id, username);
}

async function getProfile (id) {
  var profile = await findOne(id);
  profile.badges = dao.clean.badge(await dao.Badge.find('"user" = ?', id));
  profile.tags = (await dao.TagEntity.db.query(dao.query.tag, id)).rows;
  return dao.clean.profile(profile);
}

async function populateBadgeDescriptions (user) {
  user.badges = dao.clean.badge(user.badges);
  return user;
}

async function getActivities (id) {
  return {
    tasks: {
      created: dao.clean.activity(await dao.Task.find('"userId" = ?', id)),
      volunteered: (await dao.Task.db.query(dao.query.completed, id)).rows,
    },
  };
}

function processUserTags (user, tags) {
  return Promise.all(tags.map(async (tag) => {
    if(_.isNumber(tag)) {
      return await createUserTag(tag, user);
    } else {
      _.extend(tag, { 'createdAt': new Date(), 'updatedAt': new Date() });
      return await createNewUserTag(tag, user);
    }
  }));
}

async function createNewUserTag (tag, user) {
  return await dao.TagEntity.insert(tag).then(async (t) => {
    return await createUserTag(t.id, user);
  }).catch(err => {
    log.info('user: failed to create tag ', user.username, tag, err);
  });
}

async function createUserTag (tagId, user) {
  return await dao.UserTags.insert({ tagentity_users: tagId, user_tags: user.id }).then(async (tag) => {
    return await dao.TagEntity.findOne('id = ?', tag.tagentity_users).catch(err => {
      log.info('user: failed to load tag entity ', user.id, tagId, err);
    });
  }).catch(err => {
    log.info('user: failed to create tag ', user.username, tagId, err);
  });
}

async function updateProfile (attributes, done) {
  var errors = await User.validateUser(attributes, isUsernameUsed);
  if (!_.isEmpty(errors.invalidAttributes)) {
    return done(errors);
  }
  attributes.updatedAt = new Date();
  await dao.User.update(attributes).then(async (user) => {
    await dao.UserTags.db.query(dao.query.deleteUserTags, attributes.id)
      .then(async () => {
        var tags = attributes.tags || attributes['tags[]'] || [];
        await processUserTags(user, tags).then(tags => {
          user.tags = tags;
        });
        return done(null);
      }).catch (err => { return done(err); });
  }).catch (err => { return done(err); });
}

async function validateProfile (attributes) {
  var usernameUsed = await isUsernameUsed(attributes.id, attributes.username);
  if (usernameUsed.length > 0) {
    return 'A record with that `username` already exists (' + attributes.username + ').';
  }
  if (attributes.name.match(/[<>]/g)) {
    return 'Name must not contain the special characters < or >';
  }
  if (attributes.title.match(/[<>]/g)) {
    return 'Title must not contain the special characters < or >';
  }
  return null;
}

async function updatePassword (attributes) {
  attributes.password = await bcrypt.hash(attributes.password, 10);
  attributes.id = (await dao.Passport.find('"user" = ?', attributes.id))[0].id;
  await dao.Passport.update(attributes);
  return true;
}

module.exports = {
  list: list,
  findOne: findOne,
  findOneByUsername: findOneByUsername,
  getProfile: getProfile,
  populateBadgeDescriptions: populateBadgeDescriptions,
  getActivities: getActivities,
  updateProfile: updateProfile,
  updatePassword: updatePassword,
  processUserTags: processUserTags,
};
