const Joi = require('joi');

module.exports = {
    info: {
        name: 'Game',
        version: '0.0.1'
    },
    Schema: {
        title         : { type: String, required: true, trim: true, joi: Joi.string() },
        content       : { type: String, required: true, trim: true, joi: Joi.string() },
        cover         : { type: String, required: true, trim: true, joi: Joi.string().uri({scheme:/https?/}) },
        media         : { type: String, required: true, trim: true, joi: Joi.string().uri({scheme:/https?/}) }
    },
    Options: {
        controllers: {
            getAll: {
                filter: {
                    _id: false,
                    id: true
                },
                condition: {
                    deleted: {$ne: true},
                    title: {$ne: 'abc'}
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
