const mongoose = require('mongoose');
const { getUserSchema } = require('../schemas/user');

module.exports = mongoose.model('User', getUserSchema());
