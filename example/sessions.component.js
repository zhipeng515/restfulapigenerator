const Joi = require('joi');
const apiInfo = require('../lib/generateapi').apiInfo;
const Boom = require('boom');
const  _ = require('lodash');

module.exports = {
    info: {
        name: 'Session',
        version: '0.0.1'
    },
    Schema: {
        "userName"      : { type: String, required: true, unique: true, reply: false, trim: true, joi: Joi.string().email() },
        "password"      : { type: String, required: true, trim: true, reply: false, joi: Joi.string().regex(/^[\@A-Za-z0-9\!\#\$\%\^\&\*\.\~]{6,22}$/) },
        "tokens"        : { type: Array, validated: false, joi: Joi.array().items(Joi.object({token: Joi.string().regex(/[A-Za-z0-9]/), createdAt: Joi.date()})) }
    },
    Options: {
        routes: {
            getAll: {
                disable: true
            },
            getOne: {
                disable: true
            },
            update: {
                disable: true
            },
            create: {
                description: '创建token',
                notes: '根据用户名密码创建token'
            }
        },
        controllers: {
            create: {
                response: {
                    schema: {
                        token: Joi.string()
                    }
                },
                handler: function (request, reply) {
                    var payload = request.payload;
                    var object = new apiInfo.Session.model(payload);
                    object.save(function(err, data) {
                        if (!err) {
                            reply({token: _.toString(data.id)}).created('/' + data.id); // HTTP 201
                        } else {
                            reply(Boom.badImplementation(err));
                        }
                    })
                }
            }
        }
    }
};
