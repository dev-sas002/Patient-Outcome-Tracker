const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

function getUserSchema() {
  const userSchema = new mongoose.Schema(
    {
      username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
      },
      password: {
        type: String,
        required: true,
        minlength: 6,
      },
      fullName: {
        type: String,
        required: true,
        trim: true,
      },
      clinicId: {
        type: String,
        required: true,
        index: true,
      },
      role: {
        type: String,
        enum: ['doctor', 'nurse', 'admin'],
        default: 'doctor',
      },
    },
    { timestamps: true }
  );

  userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
  });

  userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  };

  userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    return obj;
  };

  return userSchema;
}

module.exports = { getUserSchema };
