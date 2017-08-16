const Joi = require('joi');

module.exports = {
    info: {
        name: 'Game',
        version: '0.0.1'
    },
    Schema: {
        userid        : { type: Number, required: true, unique: true, joi: Joi.number() },
        opponentid    : { type: Number, required: true, joi: Joi.number(),
            join: {
                path: 'opponent',
                bind: {
                    ref: 'User',
                    localField: 'opponentid',
                    foreignField: 'id',
                    justOnce: true
                },
                select: 'nickname avatar -_id'
            }
        },
        round         : { type: Number, required: true, joi: Joi.number() },
        turn          : { type: Number, required: true, joi: Joi.number() },
        drawingid     : { type: Number, required: true, joi: Joi.number(),
            join: {
                path: 'drawing',
                bind: {
                    ref: 'Drawing',
                    localField: 'drawingid',
                    foreignField: 'id',
                    justOnce: true
                },
                select: 'title answer options -_id'
            }
        }
    },
    Options: {
        controllers: {
            getAll: {
                filter: {
                    _id: false,
                    id: true,
                    turn: false
                },
                condition: function(request) {
                    return {
                        id: {$lt: request.query.lastId},
                        deleted: {$ne: true}
                    }
                }
            },
            getOne: {
                filter: {
                    _id: true,
                    id: false
                }
            }
        }
    }
}
